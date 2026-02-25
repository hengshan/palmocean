# Prompt encoder (text/point/box prompts)
from ml.models.prompt.remote_clip import RemoteCLIPTextEncoder
from ml.models.prompt.text_fusion import TextGuidedFusion

__all__ = ["RemoteCLIPTextEncoder", "TextGuidedFusion"]
