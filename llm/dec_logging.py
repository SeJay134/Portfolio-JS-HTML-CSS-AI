# llm/dec_logging.py

import logging
import functools

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)

def logger(func):
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        logging.info(f'{func.__name__} was invoked')
        return func(*args, **kwargs)
    return wrapper

