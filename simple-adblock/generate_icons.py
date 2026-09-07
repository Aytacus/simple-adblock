from PIL import Image, ImageDraw
import os

base = os.path.dirname(os.path.abspath(__file__))
out_dir = os.path.join(base, "icons")
os.makedirs(out_dir, exist_ok=True)


def draw_face(size, mood, shield_color):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    def ellipse(box, fill, outline=None, width=0):
        d.ellipse(box, fill=fill, outline=outline, width=width)

    # Round face
    cx = size / 2
    r = size * 0.44
    face_box = (cx - r, cx - r, cx + r, cx + r)
    # Angry -> orange/yellow, happy -> green
    face_color = (255, 205, 90, 255) if mood == "angry" else (150, 255, 160, 255)
    ellipse(face_box, fill=face_color, outline=(60, 60, 60, 255), width=max(2, size // 24))

    eye_y = cx - r * 0.30
    eye_r = r * 0.16
    eye_l = (cx - r * 0.40, eye_y - eye_r, cx - r * 0.14, eye_y + eye_r)
    eye_r_b = (cx + r * 0.14, eye_y - eye_r, cx + r * 0.40, eye_y + eye_r)
    ellipse(eye_l, fill=(40, 40, 40, 255))
    ellipse(eye_r_b, fill=(40, 40, 40, 255))

    if mood == "angry":
        brow_w = r * 0.34
        brow_h = max(3, size // 22)
        d.line([(cx - r * 0.42, eye_y - eye_r - brow_h), (cx - r * 0.08, eye_y - eye_r + brow_h * 0.4)],
               fill=(40, 40, 40, 255), width=brow_h)
        d.line([(cx + r * 0.08, eye_y - eye_r + brow_h * 0.4), (cx + r * 0.42, eye_y - eye_r - brow_h)],
               fill=(40, 40, 40, 255), width=brow_h)
        mouth_w = r * 0.42
        d.arc([cx - mouth_w, cx + r * 0.18, cx + mouth_w, cx + r * 0.62],
              180, 360, fill=(120, 40, 30, 255), width=max(3, size // 20))
    else:
        brow_w = r * 0.30
        brow_h = max(3, size // 26)
        d.line([(cx - r * 0.42, eye_y - eye_r - brow_h), (cx - r * 0.10, eye_y - eye_r - brow_h)],
               fill=(40, 40, 40, 255), width=brow_h)
        d.line([(cx + r * 0.10, eye_y - eye_r - brow_h), (cx + r * 0.42, eye_y - eye_r - brow_h)],
               fill=(40, 40, 40, 255), width=brow_h)
        mouth_w = r * 0.38
        d.arc([cx - mouth_w, cx + r * 0.30, cx + mouth_w, cx + r * 0.62],
              0, 180, fill=(120, 40, 30, 255), width=max(3, size // 20))

    return img


# Generate all sizes for both moods
for size in (16, 48, 128):
    angry = draw_face(size, "angry", "orange")
    happy = draw_face(size, "happy", "green")
    angry.save(os.path.join(out_dir, f"icon{size}_angry.png"))
    happy.save(os.path.join(out_dir, f"icon{size}_happy.png"))
    print(f"icon{size}_angry.png + icon{size}_happy.png")