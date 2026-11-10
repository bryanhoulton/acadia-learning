#!/usr/bin/env python3
"""
Script to extract course structure from markdown files.
Parses the course files to extract books, modules (units), and nodes.
"""

import re
from pathlib import Path
from typing import Any, Dict


def parse_course_file(file_path: str) -> Dict[str, Any]:
    """
    Parse a course markdown file and extract the structure.

    Args:
        file_path: Path to the markdown file

    Returns:
        Dictionary containing the course structure
    """
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Extract book name from filename
    book_name = Path(file_path).stem.replace("_", " ").title()
    if book_name.lower() == "math5":
        book_name = "Math 5"
    elif book_name.lower() == "prealgebra":
        book_name = "Pre-Algebra"
    elif book_name.lower() == "algebra1":
        book_name = "Algebra 1"

    course_structure = {"book_name": book_name, "modules": []}

    lines = content.strip().split("\n")
    current_module = None
    node_order = 0

    for line in lines:
        original_line = line
        line = line.strip()
        if not line:
            continue

        # Check for unit/module headers (e.g., "1. **Unit 1: Linear Equations**")
        unit_match = re.match(r"^\d+\.\s*\*\*Unit\s+\d+:\s*(.+)\*\*", line)
        if unit_match:
            if current_module:
                course_structure["modules"].append(current_module)

            module_name = unit_match.group(1).strip()
            current_module = {"name": module_name, "nodes": []}
            node_order = 0
            continue

        # Check for individual node items - these are lines with specific indentation patterns
        # Look for lines that start with spaces followed by a number and period
        if current_module and re.match(r"^\s+\d+\.", original_line):
            # Count leading spaces to determine depth
            leading_spaces = len(original_line) - len(original_line.lstrip())

            # Extract the content after the number and period
            node_match = re.match(r"^\s*\d+\.\s*(.+)", line)
            if node_match:
                node_name = node_match.group(1).strip()

                # Remove asterisks (special markers)
                if "*" in node_name:
                    node_name = node_name.replace("*", "").strip()

                # Only add nodes that are deeply indented (actual learning nodes)
                # Skip section headers (less indented items)
                if leading_spaces >= 6:  # Nodes are typically indented 6+ spaces
                    node_order += 1
                    current_module["nodes"].append({"name": node_name, "order": node_order})

    # Add the last module
    if current_module:
        course_structure["modules"].append(current_module)

    return course_structure


def extract_all_courses():
    """Extract all course files and return the parsed structure."""
    api_dir = Path(__file__).parent
    course_files = ["math5.md", "prealgebra.md", "algebra1.md"]

    all_courses = []

    for course_file in course_files:
        file_path = api_dir / course_file
        if file_path.exists():
            print(f"Parsing {course_file}...")
            course_structure = parse_course_file(str(file_path))
            all_courses.append(course_structure)

            # Print summary
            print(f"  Book: {course_structure['book_name']}")
            print(f"  Modules: {len(course_structure['modules'])}")
            total_nodes = sum(len(module["nodes"]) for module in course_structure["modules"])
            print(f"  Total Nodes: {total_nodes}")
            print()
        else:
            print(f"Warning: {course_file} not found")

    return all_courses


def print_course_structure(course_structure: Dict[str, Any]):
    """Print the course structure in a readable format."""
    print(f"=== {course_structure['book_name']} ===")

    for i, module in enumerate(course_structure["modules"], 1):
        print(f"\nModule {i}: {module['name']}")
        print(f"  Nodes ({len(module['nodes'])}):")

        for node in module["nodes"]:
            print(f"    {node['order']}. {node['name']}")


if __name__ == "__main__":
    print("Extracting course structures from markdown files...")
    print("=" * 60)

    courses = extract_all_courses()

    print("\nDetailed Structure:")
    print("=" * 60)

    for course in courses:
        print_course_structure(course)
        print("\n" + "=" * 60)

    print(f"\nTotal courses extracted: {len(courses)}")
