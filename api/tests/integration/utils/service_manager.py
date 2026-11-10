"""
Service Manager for Integration Tests

Provides a unified way to start, manage, and cleanup services needed for integration testing.
Ensures all processes are properly terminated and ports are freed.
"""

import logging
import os
import socket
import subprocess
import time
from contextlib import closing
from typing import Dict, Optional

from dotenv import load_dotenv

logger = logging.getLogger("utils")

# Ensure logging is configured for integration tests
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter("%(levelname)s %(asctime)s %(name)s: %(message)s")
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)

load_dotenv()


def find_free_port() -> int:
    """Find a free port to use for services"""
    with closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as s:
        s.bind(("", 0))
        s.listen(1)
        port = s.getsockname()[1]
    return port


class ServiceProcess:
    """Represents a managed service process."""

    def __init__(self, process: subprocess.Popen, name: str, port: Optional[int] = None, log_file=None):
        self.process = process
        self.name = name
        self.port = port
        self.start_time = time.time()
        self.log_file = log_file

    def is_alive(self) -> bool:
        """Check if the process is still running."""
        return self.process.poll() is None

    def terminate(self, timeout: int = 5) -> bool:
        """Gracefully terminate the process."""
        if not self.is_alive():
            self._close_log_file()
            return True

        logger.info(f"🛑 Terminating {self.name} (PID: {self.process.pid})")
        try:
            self.process.terminate()
            self.process.wait(timeout=timeout)
            logger.info(f"✅ {self.name} terminated gracefully")
            self._close_log_file()
            return True
        except subprocess.TimeoutExpired:
            logger.warning(f"⚠️ {self.name} didn't terminate gracefully, killing...")
            self.process.kill()
            self.process.wait()
            logger.info(f"🔨 {self.name} force killed")
            self._close_log_file()
            return True
        except Exception as e:
            logger.error(f"❌ Error terminating {self.name}: {e}")
            self._close_log_file()
            return False

    def _close_log_file(self):
        """Close the log file if it exists."""
        if self.log_file and not self.log_file.closed:
            try:
                self.log_file.close()
            except Exception as e:
                logger.warning(f"⚠️ Error closing log file for {self.name}: {e}")


class ServiceManager:
    """
    Manages the lifecycle of services needed for integration testing.

    Handles starting/stopping multiple services and ensures proper cleanup
    of all processes and resources.
    """

    def __init__(self):
        self._apply_test_env_defaults()
        self.services: Dict[str, ServiceProcess] = {}
        self.api_port = None
        self.portal_port = None
        self.project_root = self._get_project_root()
        self.logs_dir = os.path.join(self.project_root, "logs")
        os.makedirs(self.logs_dir, exist_ok=True)
        self.original_env_vars = {}

    def _get_project_root(self) -> str:
        """Get the project root directory."""
        # Go up from api/tests/integration/utils/ to project root
        return os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

    def _backup_env_var(self, key: str):
        """Backup an environment variable so it can be restored later."""
        if key in os.environ:
            self.original_env_vars[key] = os.environ[key]
        else:
            self.original_env_vars[key] = None

    def _restore_env_vars(self):
        """Restore backed up environment variables."""
        for key, value in self.original_env_vars.items():
            if value is not None:
                os.environ[key] = value
            elif key in os.environ:
                del os.environ[key]

    def _apply_test_env_defaults(self):
        """Populate required environment variables with safe defaults for tests."""
        required_defaults = {
            "STRIPE_SECRET_KEY": "sk_test_dummy",
            "STRIPE_PUBLISHABLE_KEY": "pk_test_dummy",
            "STRIPE_ANNUAL_PRICE_ID": "price_test_annual",
            "STRIPE_MONTHLY_PRICE_ID": "price_test_monthly",
            "TWILIO_ACCOUNT_SID": "AC_TEST_ACCOUNT",
            "TWILIO_AUTH_TOKEN": "test_auth_token",
            "TWILIO_PHONE_NUMBER": "+15555555555",
            "TWILIO_VERIFY_SID": "VA_TEST_VERIFY",
            "BRAINTRUST_PROJECT": "test-project",
            "BRAINTRUST_API_KEY": "test-api-key",
            "OPENAI_API_KEY": "sk-test-openai",
            "GEMINI_API_KEY": "test-gemini",
            "LIVEKIT_API_KEY": "test-livekit-key",
            "LIVEKIT_API_SECRET": "test-livekit-secret",
            "LIVEKIT_URL": "wss://test.livekit.local",
            "DEEPGRAM_API_KEY": "test-deepgram",
            "OPENAI_ORG_ID": "test-openai-org",
            "ANTHROPIC_API_KEY": "test-anthropic",
            "GOOGLE_API_KEY": "test-google",
            "AWS_ACCESS_KEY_ID": "test-aws-access",
            "AWS_SECRET_ACCESS_KEY": "test-aws-secret",
            "ELEVEN_API_KEY": "test-eleven",
            "POSTHOG_API_KEY": "test-posthog",
            "POSTHOG_HOST": "https://app.posthog.com",
            "FRONTEND_URL": "http://localhost:3000",
        }

        for key, value in required_defaults.items():
            if not os.environ.get(key):
                os.environ[key] = value

    def _kill_agent_processes(self):
        """Kill any existing agent processes to ensure fresh start."""
        try:
            # Kill main agent processes
            result = subprocess.run(
                ["pgrep", "-f", "main.py dev"],
                capture_output=True,
                text=True,
                timeout=5,
            )

            agent_pids = []
            if result.returncode == 0 and result.stdout.strip():
                agent_pids = result.stdout.strip().split("\n")

            # Kill LiveKit job processes (multiprocessing spawns)
            job_result = subprocess.run(
                ["pgrep", "-f", "multiprocessing.spawn"],
                capture_output=True,
                text=True,
                timeout=5,
            )

            job_pids = []
            if job_result.returncode == 0 and job_result.stdout.strip():
                job_pids = job_result.stdout.strip().split("\n")

            all_pids = agent_pids + job_pids
            if all_pids:
                logger.info(f"🧹 Killing {len(all_pids)} existing agent processes")
                for pid in all_pids:
                    try:
                        subprocess.run(["kill", "-9", pid], timeout=2)
                    except:
                        pass
                time.sleep(2)
                logger.info("🧹 Agent processes cleaned up")

        except Exception as e:
            logger.warning(f"🧹 Error cleaning up agent processes: {e}")

    def _wait_for_service(self, url: str, timeout: int = 30, service_name: str = "service") -> bool:
        """Wait for a service to be available."""
        import requests

        if os.environ.get("CI"):
            timeout = 60

        start_time = time.time()
        attempts = 0
        while time.time() - start_time < timeout:
            attempts += 1
            try:
                response = requests.get(url, timeout=2)
                if response.status_code == 200:
                    logger.info(f"✅ {service_name} health check passed after {attempts} attempts")
                    return True
                else:
                    logger.debug(f"🔄 {service_name} health check attempt {attempts}: HTTP {response.status_code}")
            except requests.exceptions.RequestException as e:
                logger.debug(f"🔄 {service_name} health check attempt {attempts}: {str(e)}")
            time.sleep(1)

        logger.error(f"❌ {service_name} health check failed after {attempts} attempts over {timeout}s")
        return False

    def start_api_server(self, test_db_name: Optional[str] = None) -> Optional[ServiceProcess]:
        """Start the Django API server."""
        if not self.api_port:
            self.api_port = find_free_port()

        logger.info(f"🚀 Starting Django API server on port {self.api_port}...")

        try:
            # Set up environment for API server
            api_env = os.environ.copy()
            logger.info(f"🔍 Test DB name: {test_db_name}")
            if test_db_name:
                api_env["DB_NAME"] = test_db_name
            api_env["TESTING"] = "true"
            api_env["API_URL"] = f"http://localhost:{self.api_port}"

            # Backup and set API_URL
            self._backup_env_var("API_URL")
            os.environ["API_URL"] = f"http://localhost:{self.api_port}"

            # Start Django server with output to log file
            api_log_path = os.path.join(self.logs_dir, "test_api.log")
            api_log_file = open(api_log_path, "w")

            process = subprocess.Popen(
                ["uv", "run", "python", "manage.py", "runserver", str(self.api_port)],
                cwd=os.path.join(self.project_root),
                stdout=api_log_file,
                stderr=subprocess.STDOUT,
                text=True,
                env=api_env,
            )

            service = ServiceProcess(process, "API Server", self.api_port, api_log_file)

            health_endpoint = f"http://127.0.0.1:{self.api_port}/api/utils/health/"

            api_ready = False
            logger.info(f"🔍 Trying health check endpoint: {health_endpoint}")
            if self._wait_for_service(health_endpoint, timeout=45, service_name="API Server"):
                api_ready = True

            if api_ready:
                self.services["api"] = service
                logger.info("✅ API server started successfully")
                return service
            else:
                # Log file location for debugging
                api_log_path = os.path.join(self.project_root, "django_test_output.log")
                logger.error(f"❌ API server failed to start within timeout. Check log file: {api_log_path}")

                # Try to read last few lines of log for debugging
                try:
                    with open(api_log_path, "r") as f:
                        lines = f.readlines()
                        if lines:
                            last_lines = "".join(lines[-10:])  # Last 10 lines
                            logger.error(f"Last lines from API server log:\n{last_lines}")
                except Exception as e:
                    logger.error(f"Could not read API server log: {e}")

                service.terminate()
                return None

        except Exception as e:
            logger.error(f"❌ Error starting API server: {e}")
            return None

    def start_celery_worker(self, test_db_name: Optional[str] = None) -> Optional[ServiceProcess]:
        """Start the Celery worker."""
        logger.info("🔧 Starting Celery worker...")

        try:
            api_env = os.environ.copy()
            if test_db_name:
                api_env["DB_NAME"] = test_db_name
            api_env["TESTING"] = "true"
            if self.api_port:
                api_env["API_URL"] = f"http://localhost:{self.api_port}"

            # Flush Redis
            flush_process = subprocess.Popen(
                ["redis-cli", "FLUSHALL"],
                cwd=os.path.join(self.project_root, "api"),
                env=api_env,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            flush_process.wait()
            logger.info("✅ Redis flushed")

            logfile = open(os.path.join(self.logs_dir, "test_celery.log"), "w")

            # Start Celery worker
            process = subprocess.Popen(
                ["uv", "run", "celery", "-A", "api", "worker", "-l", "info"],
                cwd=os.path.join(self.project_root),
                env=api_env,
                stdout=logfile,
                stderr=logfile,
                text=True,
            )

            service = ServiceProcess(process, "Celery Worker")
            self.services["celery"] = service
            logger.info("✅ Celery worker started successfully")
            return service

        except Exception as e:
            logger.error(f"❌ Error starting Celery worker: {e}")
            return None

    def start_agent_service(self) -> Optional[ServiceProcess]:
        """Start the LiveKit agent service."""
        # Kill any existing agents first
        self._kill_agent_processes()

        logger.info("🤖 Starting LiveKit agent service...")

        try:
            # Create agent environment
            agent_env = {}

            # Copy essential environment variables
            for key in [
                "PATH",
                "HOME",
                "USER",
                "LIVEKIT_URL",
                "LIVEKIT_API_KEY",
                "LIVEKIT_API_SECRET",
                "DEEPGRAM_API_KEY",
                "OPENAI_API_KEY",
                "ANTHROPIC_API_KEY",
                "GOOGLE_API_KEY",
                "AWS_ACCESS_KEY_ID",
                "AWS_SECRET_ACCESS_KEY",
                "DEBUG",
                "ELEVEN_API_KEY",
                "BRAINTRUST_PROJECT",
                "BRAINTRUST_API_KEY",
            ]:
                if key in os.environ:
                    agent_env[key] = os.environ[key]

            # Set API URL for agent to communicate with our test API
            if self.api_port:
                agent_env["API_URL"] = f"http://localhost:{self.api_port}"

            # Enable test mode for faster test execution
            agent_env["AGENT_TEST_MODE"] = "true"

            agent_dir = os.path.join(self.project_root, "../agent")

            # Start agent with output to file
            agent_log_path = os.path.join(agent_dir, "agent_test_output.log")
            agent_log_file = open(agent_log_path, "w")

            process = subprocess.Popen(
                ["uv", "run", "python", "main.py", "dev"],
                cwd=agent_dir,
                text=True,
                env=agent_env,
                start_new_session=True,
                stdout=agent_log_file,
                stderr=subprocess.STDOUT,
            )

            # Give agent time to start
            time.sleep(5 if not os.environ.get("CI") else 15)

            if process.poll() is None:
                service = ServiceProcess(process, "LiveKit Agent")
                self.services["agent"] = service
                logger.info("✅ Agent service started successfully")
                return service
            else:
                logger.error(f"❌ Agent failed to start. Return code: {process.returncode}")
                return None

        except Exception as e:
            logger.error(f"❌ Error starting agent: {e}")
            return None

    def start_portal_service(self) -> Optional[ServiceProcess]:
        """Start the portal service."""
        if not self.portal_port:
            self.portal_port = find_free_port()

        logger.info(f"🌐 Starting portal service on port {self.portal_port}...")

        try:
            portal_env = os.environ.copy()
            livekit_url = os.environ.get("LIVEKIT_URL")
            if not livekit_url:
                raise ValueError("LIVEKIT_URL environment variable is not set")
            portal_env.update(
                {
                    "PORT": str(self.portal_port),
                    "VITE_LIVEKIT_URL": livekit_url,
                }
            )

            if self.api_port:
                portal_env["VITE_API_URL"] = f"http://127.0.0.1:{self.api_port}"

            portal_dir = os.path.join(self.project_root, "../portal")

            portal_command = ["yarn", "dev:app", "--", "--port", str(self.portal_port), "--host", "127.0.0.1"]

            portal_log_path = os.path.join(self.logs_dir, "test_portal.log")
            portal_log_file = open(portal_log_path, "w")

            process = subprocess.Popen(
                portal_command,
                cwd=portal_dir,
                stdout=portal_log_file,
                stderr=subprocess.STDOUT,
                text=True,
                env=portal_env,
            )

            service = ServiceProcess(process, "Portal Service", self.portal_port, portal_log_file)

            # Wait for portal to be ready
            if self._wait_for_service(
                f"http://localhost:{self.portal_port}", timeout=45, service_name="Portal Service"
            ):
                self.services["portal"] = service
                logger.info("✅ Portal service started successfully")
                return service
            else:
                service.terminate()
                logger.error("❌ Portal service failed to start within timeout")
                return None

        except Exception as e:
            logger.error(f"❌ Error starting portal service: {e}")
            return None

    def get_service(self, name: str) -> Optional[ServiceProcess]:
        """Get a service by name."""
        return self.services.get(name)

    def is_service_running(self, name: str) -> bool:
        """Check if a service is running."""
        service = self.services.get(name)
        return service is not None and service.is_alive()

    def stop_service(self, name: str) -> bool:
        """Stop a specific service."""
        service = self.services.get(name)
        if service:
            success = service.terminate()
            if success:
                del self.services[name]
            return success
        return True  # Already stopped

    def cleanup(self):
        """Clean up all services and restore environment."""
        logger.info("🧹 Starting service cleanup...")

        # Stop agent first to allow it to complete cleanup
        if "agent" in self.services:
            logger.info("🛑 Terminating LiveKit Agent first...")
            agent_service = self.services["agent"]
            if not agent_service.terminate(timeout=30):
                logger.warning("⚠️ LiveKit Agent didn't terminate gracefully, killing...")
                agent_service.force_kill()
            del self.services["agent"]
            logger.info("✅ LiveKit Agent terminated")

        # Stop remaining services
        failed_services = []
        for name, service in list(self.services.items()):
            if not service.terminate(timeout=5):
                failed_services.append(name)
            else:
                del self.services[name]

        # Kill any remaining agent processes
        self._kill_agent_processes()

        # Restore environment variables
        self._restore_env_vars()

        # Wait for ports to be released
        time.sleep(2)

        if failed_services:
            logger.warning(f"⚠️ Failed to clean up services: {failed_services}")
        else:
            logger.info("✅ Service cleanup completed successfully")

    def get_api_url(self) -> Optional[str]:
        """Get the API URL for the running API server."""
        if self.api_port:
            return f"http://localhost:{self.api_port}"
        return None

    def get_portal_url(self) -> Optional[str]:
        """Get the portal URL for the running portal service."""
        if self.portal_port:
            return f"http://localhost:{self.portal_port}"
        return None

    def __enter__(self):
        """Context manager entry."""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit - ensures cleanup."""
        self.cleanup()
