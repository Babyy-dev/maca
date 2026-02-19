import re

MAX_CHAT_MESSAGE_LENGTH = 240

_PROFANE_WORDS = {
    "asshole",
    "bastard",
    "bitch",
    "cunt",
    "dick",
    "dumbass",
    "faggot",
    "fuck",
    "motherfucker",
    "nigger",
    "pussy",
    "shit",
    "slut",
    "whore",
}

_LEET_TRANSLATION = str.maketrans(
    {
        "@": "a",
        "$": "s",
        "0": "o",
        "1": "i",
        "3": "e",
        "4": "a",
        "5": "s",
        "7": "t",
        "!": "i",
    }
)

_WORD_PATTERN = re.compile(r"[a-zA-Z0-9@!$]+")


def _normalize_token(token: str) -> str:
    translated = token.lower().translate(_LEET_TRANSLATION)
    return re.sub(r"[^a-z]", "", translated)


def contains_profanity(message: str) -> bool:
    for token in _WORD_PATTERN.findall(message):
        normalized = _normalize_token(token)
        if normalized in _PROFANE_WORDS:
            return True
    return False


def sanitize_chat_message(message: str) -> tuple[str, bool]:
    trimmed = message.strip()
    if not trimmed:
        return "", False
    if len(trimmed) > MAX_CHAT_MESSAGE_LENGTH:
        trimmed = trimmed[:MAX_CHAT_MESSAGE_LENGTH]

    filtered = contains_profanity(trimmed)
    if not filtered:
        return trimmed, False

    # Replace message text when profanity is detected to keep moderation deterministic.
    return "[message removed by profanity filter]", True
