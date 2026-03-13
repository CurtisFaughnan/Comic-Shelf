from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np


ROOT = Path(__file__).resolve().parents[1]
PAGE_DIR = ROOT / "comics" / "cool-kids-stretch" / "pages"
PANEL_DIR = ROOT / "comics" / "cool-kids-stretch" / "panels"
PREVIEW_DIR = ROOT / "_panel-preview"


@dataclass
class Rect:
    x: int
    y: int
    w: int
    h: int

    @property
    def x2(self) -> int:
        return self.x + self.w

    @property
    def y2(self) -> int:
        return self.y + self.h

    @property
    def area(self) -> int:
        return self.w * self.h


def clamp(value: float, min_value: float, max_value: float) -> float:
    return max(min_value, min(max_value, value))


def detect_rects(image_path: Path) -> list[Rect]:
    image = cv2.imread(str(image_path))
    if image is None:
        raise RuntimeError(f"Could not read image: {image_path}")

    height, width = image.shape[:2]
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    # Most of the page gutter is nearly white. Invert so panel art becomes foreground.
    _, foreground = cv2.threshold(gray, 242, 255, cv2.THRESH_BINARY_INV)

    contours, _ = cv2.findContours(foreground, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    rects: list[Rect] = []
    page_area = width * height
    pad_x = max(6, width // 260)
    pad_y = max(6, height // 260)

    for contour in contours:
        x, y, rect_w, rect_h = cv2.boundingRect(contour)
        area_ratio = (rect_w * rect_h) / page_area
        if area_ratio < 0.01:
            continue
        if rect_w < width * 0.1 and rect_h < height * 0.06:
            continue

        rects.append(
            Rect(
                x=max(0, x - pad_x),
                y=max(0, y - pad_y),
                w=min(width - max(0, x - pad_x), rect_w + pad_x * 2),
                h=min(height - max(0, y - pad_y), rect_h + pad_y * 2),
            )
        )

    return sort_reading_order(remove_nested_rects(rects))


def remove_nested_rects(rects: list[Rect]) -> list[Rect]:
    result: list[Rect] = []
    for index, rect in enumerate(rects):
        if any(contains(other, rect) and other.area > rect.area for inner_index, other in enumerate(rects) if inner_index != index):
            continue
        result.append(rect)
    return result


def contains(a: Rect, b: Rect) -> bool:
    return a.x <= b.x and a.y <= b.y and a.x2 >= b.x2 and a.y2 >= b.y2


def sort_reading_order(rects: list[Rect]) -> list[Rect]:
    if not rects:
        return []

    rows: list[list[Rect]] = []
    tolerance = max(rect.h for rect in rects) * 0.28

    for rect in sorted(rects, key=lambda item: (item.y, item.x)):
        center_y = rect.y + rect.h / 2
        placed = False
        for row in rows:
            row_center = np.mean([item.y + item.h / 2 for item in row])
            if abs(center_y - row_center) <= tolerance:
                row.append(rect)
                placed = True
                break
        if not placed:
            rows.append([rect])

    rows.sort(key=lambda row: min(item.y for item in row))
    ordered: list[Rect] = []
    for row in rows:
        ordered.extend(sorted(row, key=lambda item: item.x))
    return ordered


def write_json(page_number: int, rects: list[Rect], width: int, height: int) -> None:
    payload = [
        {
            "id": f"{page_number}-{index + 1}",
            "x": round(clamp(rect.x / width, 0, 1), 6),
            "y": round(clamp(rect.y / height, 0, 1), 6),
            "w": round(clamp(rect.w / width, 0.01, 1), 6),
            "h": round(clamp(rect.h / height, 0.01, 1), 6),
        }
        for index, rect in enumerate(rects)
    ]

    output_path = PANEL_DIR / f"{page_number}.json"
    output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def write_preview(page_path: Path, rects: list[Rect]) -> None:
    image = cv2.imread(str(page_path))
    if image is None:
        return

    for index, rect in enumerate(rects):
        color = (40 + (index * 35) % 200, 180, 255 - (index * 20) % 200)
        cv2.rectangle(image, (rect.x, rect.y), (rect.x2, rect.y2), color, 7)
        cv2.putText(
            image,
            str(index + 1),
            (rect.x + 12, rect.y + 42),
            cv2.FONT_HERSHEY_SIMPLEX,
            1.2,
            color,
            3,
            cv2.LINE_AA,
        )

    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(PREVIEW_DIR / page_path.name), image)


def main() -> None:
    PANEL_DIR.mkdir(parents=True, exist_ok=True)
    existing = {int(path.stem) for path in PANEL_DIR.glob("*.json") if path.stem.isdigit()}

    for page_path in sorted(PAGE_DIR.glob("*.jpg")):
        if not page_path.stem.isdigit():
            continue

        page_number = int(page_path.stem)
        if page_number in existing:
            continue

        image = cv2.imread(str(page_path))
        if image is None:
            continue

        height, width = image.shape[:2]
        rects = detect_rects(page_path)

        if len(rects) <= 1:
            continue

        write_json(page_number, rects, width, height)
        write_preview(page_path, rects)
        print(f"generated page {page_number}: {len(rects)} panels")


if __name__ == "__main__":
    main()
