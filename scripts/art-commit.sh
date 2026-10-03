#!/usr/bin/env bash
# 생성된 그림의 원화를 assets/orig/에 보관하고, 게임용은 256px로 줄여서 커밋·푸시 (그림 생성 중간중간 불림)
set -u
python3 - <<'PY'
import glob, os, shutil
from PIL import Image
os.makedirs('assets/orig', exist_ok=True)
for f in glob.glob('assets/*.png'):
    try:
        im = Image.open(f); im.load()
        if im.width > 256:
            # 1024px 원화는 assets/orig/에 그대로 보관, 게임용은 256px로
            shutil.copyfile(f, os.path.join('assets/orig', os.path.basename(f)))
            im.resize((256, 256), Image.LANCZOS).save(f, optimize=True)
            print('shrunk', f)
    except Exception as e:
        print('skip', f, e)  # 아직 쓰는 중인 파일은 다음 차례에
PY
git add assets
git diff --cached --quiet && exit 0
git commit -q -m "Generated art ($(git diff --cached --name-only | wc -l) files)"
for i in 1 2 3; do
  git pull -q --rebase origin "${GITHUB_REF_NAME}" && git push -q origin "HEAD:${GITHUB_REF_NAME}" && exit 0
  sleep 3
done
exit 1
