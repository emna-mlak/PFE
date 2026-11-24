__all__ = ["PlateOCRPipeline"]


def __getattr__(name: str):
    if name == "PlateOCRPipeline":
        from .pipeline import PlateOCRPipeline
        return PlateOCRPipeline
    raise AttributeError(name)
