from django.core.management.base import BaseCommand, CommandError

from entities.models import Entity
from lms.accounts.email_service import OnboardingEmailService
from lms.accounts.models import User


class Command(BaseCommand):
    help = "Send test emails to a specified email address"

    def add_arguments(self, parser):
        parser.add_argument("email", type=str, help="Email address to send test emails to")
        parser.add_argument(
            "--type",
            type=str,
            choices=["parent_thank_you", "student_password_setup", "student_test_assignment", "password_reset", "all"],
            default="all",
            help="Type of email to send (default: all)",
        )

    def handle(self, *args, **options):
        email = options["email"]
        email_type = options["type"]

        if not email:
            raise CommandError("Email address is required")

        # Validate email format
        from django.core.exceptions import ValidationError
        from django.core.validators import validate_email

        try:
            validate_email(email)
        except ValidationError:
            raise CommandError("Invalid email address format")

        # Create test data
        test_parent_name = "Test Parent"
        test_student_name = "Test Student"

        entity = Entity.objects.all().first()
        if not entity:
            raise CommandError("No entity found")

        sample_user = User.objects.all().first()
        if not sample_user:
            raise CommandError("No user found")

        try:
            email_service = OnboardingEmailService()
        except ValueError as e:
            raise CommandError(f"Email service initialization failed: {e}")

        # Send emails based on type
        success_count = 0
        total_count = 0

        if email_type in ["parent_thank_you", "all"]:
            self.stdout.write("Sending parent thank you email...")
            total_count += 1
            if email_service.send_parent_thank_you_email(
                parent_email=email, parent_name=test_parent_name, student_name=test_student_name, entity=entity
            ):
                success_count += 1
                self.stdout.write(self.style.SUCCESS("✓ Parent thank you email sent"))
            else:
                self.stdout.write(self.style.ERROR("✗ Failed to send parent thank you email"))

        if email_type in ["student_password_setup", "all"]:
            self.stdout.write("Sending student password setup email...")
            total_count += 1
            if email_service.send_student_password_setup_email(
                student_email=email, student_name=test_student_name, student_user=sample_user, entity=entity
            ):
                success_count += 1
                self.stdout.write(self.style.SUCCESS("✓ Student password setup email sent"))
            else:
                self.stdout.write(self.style.ERROR("✗ Failed to send student password setup email"))

        if email_type in ["student_test_assignment", "all"]:
            self.stdout.write("Sending student test assignment email...")
            total_count += 1
            if email_service.send_student_test_assignment_email(
                student_email=email, student_name=test_student_name, entity=entity
            ):
                success_count += 1
                self.stdout.write(self.style.SUCCESS("✓ Student test assignment email sent"))
            else:
                self.stdout.write(self.style.ERROR("✗ Failed to send student test assignment email"))

        if email_type in ["password_reset", "all"]:
            self.stdout.write("Sending password reset email...")
            total_count += 1
            if email_service.send_password_reset_email(
                user_email=email, user_name=test_student_name, user=sample_user, entity=entity
            ):
                success_count += 1
                self.stdout.write(self.style.SUCCESS("✓ Password reset email sent"))
            else:
                self.stdout.write(self.style.ERROR("✗ Failed to send password reset email"))

        # Summary
        if success_count == total_count:
            self.stdout.write(self.style.SUCCESS(f"\nAll {total_count} test emails sent successfully to {email}!"))
        elif success_count > 0:
            self.stdout.write(
                self.style.WARNING(f"\n{success_count}/{total_count} test emails sent successfully to {email}")
            )
        else:
            self.stdout.write(self.style.ERROR(f"\nFailed to send any test emails to {email}"))
