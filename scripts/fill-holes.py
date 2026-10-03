# 투명 배경으로 뽑을 때 그림 안쪽의 흰 부분(태극기 바탕 등)까지 투명해지는 문제를 고침:
# 바깥 테두리와 이어지지 않은, 그림 속에 갇힌 투명한 구멍을 불투명한 흰색으로 채움
# 쓰는 법: python3 scripts/fill-holes.py assets/tile-korea-a.png assets/tile-korea-b.png ...
import sys
from collections import deque
from PIL import Image

def fill(path, thr=200):
    im = Image.open(path).convert('RGBA')
    w, h = im.size
    px = im.load()
    clear = lambda x, y: px[x, y][3] < thr
    outside = bytearray(w * h)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if clear(x, y) and not outside[y * w + x]: outside[y * w + x] = 1; q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if clear(x, y) and not outside[y * w + x]: outside[y * w + x] = 1; q.append((x, y))
    while q:
        x, y = q.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not outside[ny * w + nx] and clear(nx, ny):
                outside[ny * w + nx] = 1; q.append((nx, ny))
    n = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 255 and not outside[y * w + x]:
                # 반투명한 부분은 흰 바탕 위에 겹친 색으로
                k = a / 255
                px[x, y] = (round(r * k + 255 * (1 - k)), round(g * k + 255 * (1 - k)), round(b * k + 255 * (1 - k)), 255)
                n += 1
    im.save(path, optimize=True)
    print(path, 'filled', n)

for p in sys.argv[1:]:
    fill(p)
