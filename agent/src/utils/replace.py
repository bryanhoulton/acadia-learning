LLM_REPLACEMENTS = replacements = {
    r"\*": "",
    r"\'(a-z)\'": "<spell>\\1</spell>",
    r"(\s+)(y)(\s+)": "\\1<spell>\\2</spell>\\3",
    r"(\s+)([a-z])(\.|\?|\!|\:|\;|\,|\'|\"|\(|\))": "\\1<spell>\\2</spell>\\3",
    r"\$.*?\\.*?\$": "",  # Remove anything between non-escaped dollar signs with backslashes inside
    r"\-([\d|,]+)": "negative \\1",  # Replace negative numbers with "negative"
}

TRANSCRIPTION_REPLACEMENTS = {
    r"<.+?>": "",
    r"<speak>": "",
    r"</speak>": "",
}
