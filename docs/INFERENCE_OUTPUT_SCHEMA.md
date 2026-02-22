# Inference Output GeoJSON Schema

> Defines the format of inference results returned by PalmView's detection pipeline.

## Overview

All detection results are returned as a **GeoJSON FeatureCollection** conforming to [RFC 7946](https://datatracker.ietf.org/doc/html/rfc7946). Each Feature represents a single detected object (e.g., a palm tree) as a **Point** geometry.

## Schema

```jsonc
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [<longitude>, <latitude>]   // WGS84, decimal degrees
      },
      "properties": {
        "confidence":   <float>,   // 0.0 – 1.0, model confidence score
        "class_name":   <string>,  // detection class, e.g. "palm_tree"
        "model_name":   <string>,  // model identifier, e.g. "palm-det-v1"
        "tile_id":      <string>,  // source tile, e.g. "tile_002_003"
        "detection_id": <string>   // UUID, unique per detection
      }
    }
  ]
}
```

## Property Reference

| Property       | Type   | Required | Description                                     |
|----------------|--------|----------|-------------------------------------------------|
| `confidence`   | float  | ✅       | Model confidence score in range `[0, 1]`.       |
| `class_name`   | string | ✅       | Object class label (e.g. `palm_tree`).          |
| `model_name`   | string | ✅       | Name/version of the model that produced this.   |
| `tile_id`      | string | ✅       | Identifier of the image tile that was processed. |
| `detection_id` | string | ✅       | UUID unique to this detection.                  |

## WebSocket Progress Messages

During inference the server pushes messages over `ws://.../api/v1/inference/jobs/{job_id}/stream`:

### Progress (per tile)

```json
{
  "type": "progress",
  "completed": 5,
  "total": 16,
  "percent": 31.25,
  "current_tile": "tile_001_001"
}
```

### Complete

```json
{
  "type": "complete",
  "result_url": "/outputs/<job_id>/result.geojson",
  "summary": {
    "total_detections": 112,
    "tile_count": 16,
    "model_name": "palm-det-v1",
    "duration_seconds": 2.34
  }
}
```

### Error

```json
{
  "type": "error",
  "message": "Out of memory"
}
```

## Notes

- Coordinates are **WGS84 (EPSG:4326)**, longitude first per GeoJSON spec.
- The frontend can render the FeatureCollection directly on a map layer.
- Future versions may include `Polygon` geometries for canopy segmentation.
