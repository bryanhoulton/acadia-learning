import logging

from django.core.management.base import BaseCommand

from entities.memory_evals.runner import run_all, run_single

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Run memory compression eval suite"

    def add_arguments(self, parser):
        parser.add_argument(
            "--loglevel",
            type=str,
            help="Log level to set for evals",
            default="INFO",
        )
        parser.add_argument(
            "--dataset",
            type=str,
            help="Run only the specified dataset (without .json extension)",
            default=None,
        )

    def handle(self, *args, **options):
        # Set log level
        log_level = options["loglevel"]
        loggers = [logging.getLogger(name) for name in logging.root.manager.loggerDict]
        for log in loggers:
            log.setLevel(log_level)

        self.stdout.write("\n----------- MEMORY EVALS ------------\n")
        dataset = options.get("dataset")
        if dataset:
            results = run_single(dataset)
        else:
            results = run_all()

        self.stdout.write("\n---------- RESULTS ----------\n")

        # Collect all average scores and costs for total calculation
        all_averages = []
        total_cost = 0.0
        total_summary_cost = 0.0
        total_qa_cost = 0.0
        total_judge_cost = 0.0
        total_input_tokens = 0
        total_output_tokens = 0

        for dataset_name, data in results.items():
            self.stdout.write(f"\n{self.style.SUCCESS(dataset_name)}:")
            self.stdout.write(f"  Model: {data.get('model', 'unknown')}")
            self.stdout.write(f"  Context chars: {data.get('context_chars', 0):,}")

            # Check if detailed results with scores/metrics exist
            if "scores" in data:
                scores = data["scores"]
                avg = sum(scores.values()) / len(scores) if scores else 0.0
                all_averages.append(avg)
                self.stdout.write(f"  Average Score: {self.style.SUCCESS(f'{avg:.2f}')}")

                if scores:
                    self.stdout.write("  Per-question scores:")
                    for qid, score in scores.items():
                        self.stdout.write(f"    {qid}: {score:.2f}")

            if "metrics" in data:
                metrics = data["metrics"]
                self.stdout.write("  Compression:")
                reduction_ratio = metrics.get("reduction_ratio", 0)
                compression_factor = (1 / reduction_ratio) if reduction_ratio > 0 else 0
                self.stdout.write(
                    f"    {metrics.get('raw_tokens', 0):,} → {metrics.get('context_tokens', 0):,} tokens (~{compression_factor:.0f}x reduction)"
                )
                llm_usage = metrics.get("llm_usage", {})
                input_tokens = llm_usage.get("input_tokens", 0)
                output_tokens = llm_usage.get("output_tokens", 0)
                total_input_tokens += input_tokens
                total_output_tokens += output_tokens
                self.stdout.write(f"    LLM: {input_tokens:,} in / {output_tokens:,} out")

                # Cost breakdown per dataset
                cost_data = metrics.get("cost", {})
                if cost_data:
                    dataset_cost = cost_data.get("total", 0)
                    total_cost += dataset_cost
                    total_summary_cost += cost_data.get("summary", 0)
                    total_qa_cost += cost_data.get("qa", 0)
                    total_judge_cost += cost_data.get("judge", 0)
                    self.stdout.write(f"    Cost: ${dataset_cost:.4f}")

        # Calculate and display total average score and costs
        self.stdout.write(f"\n{self.style.SUCCESS('=' * 50)}")
        if all_averages:
            total_avg = sum(all_averages) / len(all_averages)
            self.stdout.write(f"{self.style.SUCCESS('TOTAL AVERAGE SCORE:')} {self.style.SUCCESS(f'{total_avg:.2f}')}")

        self.stdout.write(f"\n{self.style.WARNING('USAGE & COST SUMMARY:')}")
        self.stdout.write(f"  Total tokens: {total_input_tokens:,} in / {total_output_tokens:,} out")
        self.stdout.write(f"  Summary cost (gpt-5.2):   ${total_summary_cost:.4f}")
        self.stdout.write(f"  QA cost (o3):             ${total_qa_cost:.4f}")
        self.stdout.write(f"  Judge cost (gpt-4o-mini): ${total_judge_cost:.4f}")
        self.stdout.write(f"  {self.style.WARNING(f'TOTAL COST: ${total_cost:.4f}')}")
        self.stdout.write(f"{self.style.SUCCESS('=' * 50)}")

        self.stdout.write("\n\nOutputs written to: api/entities/memory_evals/outputs/\n")
