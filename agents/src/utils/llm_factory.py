import os
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic

def get_llm(model_config=None):
    """
    Centralized factory to initialize the LLM.
    Supports both OpenAI-compatible endpoints (e.g. OpenRouter) and direct Anthropic SDK.
    """
    if model_config is None:
        model_config = {}

    model_name = model_config.get("model") or os.getenv("DEFAULT_MODEL", "gpt-4o-mini")
    temp = model_config.get("temperature", 0.2)
    max_tokens = model_config.get("max_tokens", 8192)
    thinking = model_config.get("thinking", False)

    # Route to Anthropic SDK if model specifically indicates claude AND no base_url is set
    # (If base_url is set, it means we are using OpenRouter or similar proxy)
    base_url = os.getenv("OPENAI_API_BASE")
    if "claude" in model_name.lower() and not base_url:
        return ChatAnthropic(
            model_name=model_name,
            temperature=temp,
            max_tokens=max_tokens,
            api_key=os.getenv("ANTHROPIC_API_KEY", "")
        )

    # Otherwise route to ChatOpenAI (handles OpenAI and OpenRouter/DeepSeek proxies)
    kwargs = {
        "model": model_name,
        "temperature": temp,
        "max_tokens": max_tokens,
        "api_key": os.getenv("OPENAI_API_KEY", ""),
    }
    
    if base_url:
        kwargs["base_url"] = base_url

    # Specific support for DeepSeek R1 / OpenRouter thinking
    if thinking and "deepseek" in model_name.lower():
        kwargs["model_kwargs"] = {"extra_body": {"thinking": True}}
    
    return ChatOpenAI(**kwargs)
