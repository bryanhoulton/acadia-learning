import os


def SYSTEM_PROMPT(name: str, registration_source: str = "web"):
    """
    Load the system prompt from system-prompt.md.

    Args:
        name: The tutor's name to insert into the prompt
        registration_source: 'web' or 'mobile' (unused, kept for compatibility)
    """
    with open(os.path.join(os.path.dirname(__file__), "system-prompt.md"), "r") as f:
        prompt = f.read()

    return prompt.replace("{name}", name)


CANVAS_INSTRUCTIONS = """
    During lessons, tutors can use the canvas to build UI.

    The canvas is a list of "blocks" that are rendered.

    Blocks:
    - Text: A block of text that is rendered as markdown.
    - Math: A block of math that is rendered as LaTeX.
    - Question: A block of text that is rendered as a question. You should not have multiple questions 
        in one question block.
    - Graph: A block of math that is rendered as a graph. You can graph points (x, y) or Desmos 
        compatible equations where y is a function of x. You may set the color of the equations and 
        points.
    - Table: A block of data that is rendered as a table. You can set the headers and rows of the table.
    - Timeline: A block of data that is rendered as a timeline. You can set the events and their dates.
"""
