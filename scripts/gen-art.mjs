// ROBOT RU$H 그림 생성 스크립트 (OpenAI gpt-image-1)
//
// 쓰는 법:
//   OPENAI_API_KEY=sk-... node scripts/gen-art.mjs            # 전부 (이미 있는 파일은 건너뜀)
//   OPENAI_API_KEY=sk-... node scripts/gen-art.mjs tile-wheel # 이름에 이 글자가 들어간 것만
//   FORCE=1 ... node scripts/gen-art.mjs robot-amr            # 있어도 다시 그림
//   QUALITY=high ... (기본 medium. low / medium / high)
//
// 결과: assets/<이름>-a.png, assets/<이름>-b.png (까딱까딱 2프레임), 손님 얼굴은 assets/face-<이름>.png 한 장
// 스타일 기준: assets/style/ref-*.png (사용자가 준 예시 그림 2장)
// 만드는 법:
//   a 프레임 = 예시 그림을 참고 이미지로 넣고 새 그림 생성 (images/edits)
//   b 프레임 = a 프레임을 넣고 "똑같은 그림, 살짝 기울고 눌린 자세"로 다시 그림 → 둘을 번갈아 보여 주면 까딱까딱
// Node 18 이상, 추가 패키지 없음.

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'assets');
const KEY = process.env.OPENAI_API_KEY;
const QUALITY = process.env.QUALITY || 'medium';
const FORCE = !!process.env.FORCE;
const FORCE_B = !!process.env.FORCE_B;  // b프레임만 다시 그림
const ONLY = process.argv[2] || '';
const CONCURRENCY = 3;
if (!KEY) { console.error('OPENAI_API_KEY가 없어요.'); process.exit(1); }

// ───────── 공통 스타일 ─────────
const STYLE = [
  'Cute, simple cartoon sticker style, matching the reference images, with thick solid black outlines and fully opaque colors (never pale or see-through):',
  'bold thick black outlines, flat colors with soft cel shading, chunky rounded shapes, friendly and playful.',
  'Exactly one subject, centered, filling about 80% of the canvas with even padding.',
  'No text, no letters, no numbers, no logos, no background scenery, no drop shadow on the ground, no glow, no light halo or white light behind the subject.',
  'Fully transparent background.',
].join(' ');
// 타일 그림은 색 있는 타일 위에 올라감 → 물체만, 밝은 회색 금속 위주
const PART = 'A single machine part icon for a match-3 game tile. Mostly light gray and white metal with small accent colors so it reads on any colored tile. No face.';
// 완성 로봇은 예시 드론처럼 귀여운 얼굴(눈·입)
const ROBOT = 'A cute industrial robot character with a small friendly face (two round black eyes with highlights, small smiling mouth) like the reference drone. White and light gray body with orange accent lights.';
// 업종 아이콘: 그 업종을 떠올리게 하는 상징물 하나
const ROBOTS_COOK = `${ROBOT} A cooking collaborative robot arm on a round base, the face on the base. Instead of a gripper, the end of the arm holds a deep-fryer basket (a wire mesh frying basket with a handle) full of golden fried food. No glow or light burst behind it.`;
const PLACE = 'A cute icon representing an industry or workplace, drawn as one simple symbolic object or tiny building. It may have a tiny friendly face.';
const WORKER = 'A funny chibi cartoon client character, full body, very big head (about half of the total height) and a small body, drawn in the same cute style as the reference humanoid/drone: a Korean factory worker wearing a yellow safety helmet (hard hat), an orange high-visibility safety vest over a gray work uniform, work gloves and safety boots, clean-shaven with NO mustache and no beard, very exaggerated, comical facial expression.';
const COOK = 'A funny chibi cartoon client character, full body, very big head (about half of the total height) and a small body, drawn in the same cute style as the reference humanoid/drone: a Korean cook (a middle-aged woman) wearing a white cook hat, a white chef uniform and a red apron, holding a ladle, rosy round cheeks, very exaggerated, comical facial expression.';
const SUITF = 'A funny chibi cartoon client character, full body, very big head (about half of the total height) and a small body, drawn in the same cute style as the reference humanoid/drone: a middle-aged Korean woman manager in a charcoal skirt suit and white blouse, short bob hair, a small pearl necklace, holding a tablet, very exaggerated, comical facial expression.';
const TRUMP = 'A cute but recognizable chibi cartoon caricature of Donald Trump as a game client, full body, very big head and a small body, same cute style as the references. FACE RULES (follow exactly): the skin is a strong ORANGE spray-tan color (orange face, not pink, not beige). The face has ONLY three features, like a simple smiley: two tiny eyes and one small mouth. NOTHING else on the face: no nose of any kind (no nose shape, no nose line, no nostrils, no bump), no cheek lines between the eyes and the mouth; that area is plain flat orange skin. The two eyes are VERY SMALL (tiny dots or short slits) and placed almost touching each other, with the gap between the eyes narrower than one eye width, both bunched together at the center of the face just above the mouth, under heavy furrowed eyebrows. Do not draw big or widely spaced eyes. A small pursed mouth sits close under the eyes, so eyes and mouth are crowded in the middle; a lot of empty face below the mouth and no separate chin, the jaw flows into a thick neck. HAIR: a thin, wispy, see-through comb-over of very light bright platinum-yellow blond hair lying flat on the head, with the scalp showing through; small and low, NOT a big puffy hairdo. An older man around 75. OUTFIT: a bright, highly saturated royal blue suit, a pure WHITE dress shirt, a very long red tie, a small American flag pin. Exaggerated comical expression, good-natured.';
const CLIENT = 'A funny chibi cartoon client character, full body, very big head (about half of the total height) and a small body, drawn in the same cute style as the reference humanoid/drone: a middle-aged Korean company manager in a navy suit and red tie, round glasses, a comb-over hairstyle, very exaggerated, comical facial expression.';

// ───────── 그림 목록 ─────────
// kind: 'anim' = a·b 2프레임, 'still' = 한 장
const ITEMS = [
  // 부품 타일 10
  { name: 'tile-wheel', kind: 'anim', move: 'the wheel is rotated a quarter turn (the bolts are in a different place), as if rolling', prompt: `${PART} A small chunky robot drive wheel like on a toy robot or an AMR: a big round light gray hub with a few round bolts and a thin smooth dark gray rim. NOT a car tire: no tread pattern, no rim spokes, no car wheel look.` },
  { name: 'tile-auto', kind: 'anim', move: 'the blue scan ring glows brighter and the lidar top is turned a little, as if scanning', prompt: `${PART} An autonomous driving sensor module: a small lidar puck on a base with a glowing blue scan ring.` },
  { name: 'tile-floor', kind: 'anim', move: 'the tape roll has unrolled a bit further and the guide line is a little longer', prompt: `${PART.replace('machine part', 'floor work')} Floor installation for an AGV path: a roll of yellow-and-black striped magnetic guide tape unrolling across a small square of gray factory floor, laying down a straight guide line that ends in a little arrow, with a small paint roller beside it. It should clearly read as 'laying a guide line on the floor'.` },
  { name: 'tile-arm', kind: 'anim', move: 'Keep every part the same size and length; the body stays exactly in place. The arm nods DOWN: bend the elbow so the end flange points downward; the base does not move.', prompt: `${PART} A bare collaborative robot arm (cobot) with a round base, two links and three joints, ending in an empty tool flange. No gripper, no hand.` },
  { name: 'tile-tool', kind: 'anim', move: 'the two gripper fingers are CLOSED together, as if grabbing', prompt: `${PART} A two-finger robot gripper (end effector) with a wrist mount on top, fingers open, pointing down.` },
  { name: 'tile-legs', kind: 'anim', move: 'the knee is bent more and the foot is lifted a little, as if taking a step', prompt: `${PART} A single robot leg with a thigh, knee joint and a rounded foot, like a quadruped robot leg.` },
  { name: 'tile-hum', kind: 'anim', move: 'Keep every part the same size and length; the body stays exactly in place. Marching in place: raise the left knee high with that foot off the ground, the right foot stays on the ground, arms swing; same face.', prompt: `A cute small humanoid robot standing, full body, white and light gray with a dark visor face showing two glowing eyes. Special golden glow outline.` },
  // 특별 타일 (4단계 이후 가끔 휴머노이드 대신): 머리만, 귀여운 카툰
  { name: 'tile-term', kind: 'anim', move: 'he lowers the sunglasses a little with one finger, showing a glowing red robot eye peeking over them', prompt: `A cute chibi cartoon HEAD (and shoulders) of the 1984 cyborg action hero: a muscular man with a short flat-top haircut and black sunglasses, with a caricature of Arnold\'s famous face: drawn in a THREE-QUARTER side view so the profile is visible: the MOUTH and lips clearly push forward past the nose line (a protruding, pouty mouth like a slight muzzle, the most forward part of the face), while the CHIN behind it stays normal and does not stick out; a wide face, thin stern tight-lipped mouth, prominent cheekbones, a stern expressionless face, a black leather biker jacket collar. One small torn patch on the cheek shows shiny chrome metal underneath. Funny and cute, not scary, no blood. Special golden glow outline.` },
  { name: 'tile-gundam', kind: 'anim', move: 'the two eyes flash bright with a small white sparkle glint on each eye (nothing else changes, no steam)', prompt: `A cute chibi cartoon HEAD ONLY of a classic Japanese anime mecha giant robot: white helmet-shaped head with a big yellow V-shaped antenna crest on the forehead, red chin piece, blue face vents, two green-yellow eyes. Head only, no body. Special golden glow outline.` },
  { name: 'tile-eva', kind: 'anim', move: 'the jaw is wide open as if roaring, eyes glowing brighter', prompt: `A cute chibi cartoon HEAD ONLY of a purple biomechanical anime giant robot: dark purple armored head with a single long horn on the forehead, bright lime-green accents, glowing yellow-green eyes, open jaw with teeth, slightly scary but cute. Head only, no body. Special golden glow outline.` },
  { name: 'tile-tf', kind: 'anim', move: 'the blue eyes glow brighter and the mouth plate slides open a little, as if talking', prompt: `A cute chibi cartoon HEAD ONLY of a heroic transforming robot leader from 1980s cartoons: a blue helmet head with two tall silver antenna fins on the sides, a silver faceplate covering the mouth, bright glowing blue eyes, red and blue colors. Head only, no body. Special golden glow outline.` },
  { name: 'tile-union', kind: 'anim', move: 'the raised fist is pumped higher and the mouth is open shouting', prompt: `A funny chibi cartoon labor union activist, full body, very big head and small body, same cute style as the references: a Korean worker in work clothes wearing a red protest headband (meoridtti) tied around the forehead, one fist raised, holding a signed agreement paper with a red seal in the other hand, determined but friendly expression.` },
  { name: 'tile-made', kind: 'anim', move: 'the box flaps are open a little and the export arrow points further', prompt: `${PART.replace('machine part', 'symbol')} A cardboard shipping box with a small United States flag sticker and an export arrow, meaning overseas export to the USA.` },
  { name: 'tile-korea', kind: 'anim', move: 'the flag waves the other way in the wind', prompt: `${PART.replace('machine part', 'symbol')} A small factory building with a South Korean flag (taegukgi) waving on a pole on top, meaning made in Korea. The flag must have an OPAQUE solid pure white background filled in white (not transparent, not see-through), with a thick black outline around the flag, the red-blue taegeuk circle in the middle and the four black trigrams.` },

  // 완성 로봇 7
  { name: 'robot-amr', kind: 'anim', move: 'the wheels are turned and the box on top hops up a little, as if driving', prompt: `${ROBOT} An AMR: a low flat four-wheeled autonomous mobile robot carrying a small box on top. Nothing on top except the box: no lidar dome, no sensor, no antenna.` },
  { name: 'robot-agv', kind: 'anim', move: 'the wheels are turned and the pallet on top hops up a little, as if driving along the line', prompt: `${ROBOT} An AGV: a low rectangular automated guided cart following a yellow guide line on the floor, carrying a pallet.` },
  { name: 'robot-cobot', kind: 'anim', move: 'Keep every part the same size and length; the body stays exactly in place. The arm nods DOWN by bending the elbow and wrist so the gripper points downward, AND the two gripper fingers are CLOSED together (in the first image they are open). The arm is NOT longer.', prompt: `${ROBOT} A collaborative robot arm on a round base with a two-finger gripper at the end, the face on the base. Plain transparent background around it: absolutely no white glow or light burst behind the arm.` },
  { name: 'robot-cobot-weld', kind: 'anim', ref: 'robot-cobot-a', move: 'Keep every part the same size and length; the body stays exactly in place. The arm nods DOWN by bending the elbow and wrist so the welding torch points downward with a bigger spark. The arm is NOT longer.', prompt: `${ROBOT} A welding collaborative robot arm on a round base, the face on the base. Instead of a gripper, the end of the arm holds a welding torch (a bent welding gun nozzle) with a small bright welding spark at the tip. No glow or light burst behind it.` },
  { name: 'robot-cobot-cook', kind: 'anim', ref: 'robot-cobot-a', move: 'Keep every part the same size and length; the body stays exactly in place. The arm nods DOWN by bending the elbow and wrist so the frying basket is lowered. The arm is NOT longer.', prompt: `${ROBOTS_COOK}` },
  { name: 'robot-mm', kind: 'anim', move: 'Keep every part the same size and length; the body stays exactly in place. The arm nods DOWN by bending the elbow and wrist so the gripper points downward, AND the two gripper fingers are CLOSED together. The wheeled base does not move.', prompt: `${ROBOT} A mobile manipulator: a low flat box-shaped wheeled AMR base with a collaborative robot arm and gripper mounted directly on top of the base. NO robot head, no helmet, no humanoid torso: the cute face is drawn on the front side of the flat base box.` },
  { name: 'robot-quad', kind: 'anim', move: 'Keep every part the same size and length; the body stays exactly in place. Marching in place: lift the front-left leg and the back-right leg clearly off the ground with the knees bent up; the other two legs stand straight on the ground.', prompt: `${ROBOT} A headless four-legged robot like Boston Dynamics Spot: one rounded box-shaped body on four mechanical legs. Legs are white rounded segments with dark gray joints and bright ORANGE round feet (like a cute toy robot). NO head, no neck, no dog head, no ears, no tail. The cute face is drawn on the front end of the body box. Legs like Boston Dynamics Spot: all four legs stand under the body, not splayed out like a spider. Every knee bends BACKWARD: the knee joint sticks out toward the rear (tail side) of the robot, the upper leg goes down and back from the body to the knee, and the lower leg goes down and forward from the knee to a small round foot. No knee may point toward the front (face side).` },
  { name: 'robot-qarm', kind: 'anim', move: 'Keep every part the same size and length; the body stays exactly in place. Marching in place: lift the front-left leg and the back-right leg clearly off the ground with knees bent; ALSO the arm on its back nods DOWN and the gripper fingers are CLOSED (in the first image they are open).', prompt: `${ROBOT} A headless four-legged robot like Boston Dynamics Spot with a robot arm and gripper mounted on top of its body, the arm reaching forward. NO head, no neck, no dog head, no ears, no tail. The cute face is drawn on the front end of the body box. Legs like Boston Dynamics Spot: all four legs stand under the body, not splayed out like a spider. Every knee bends BACKWARD: the knee joint sticks out toward the rear (tail side) of the robot, the upper leg goes down and back from the body to the knee, and the lower leg goes down and forward from the knee to a small round foot. No knee may point toward the front (face side).` },
  { name: 'robot-centaur', kind: 'anim', move: 'Keep every part the same size and length; the body stays exactly in place. Marching in place: lift the front-left leg and the back-right leg clearly off the ground with knees bent; the humanoid upper body stays the same.', prompt: `${ROBOT} A centaur robot: a four-legged robot body with a humanoid robot upper torso, two arms and head on top.` },

  // 업종 아이콘 16 (게임의 업종 이름과 같은 순서)
  { name: 'ind-port', kind: 'anim', prompt: `${PLACE} A seaport: a stack of shipping containers with a small harbor crane. (항만)` },
  { name: 'ind-aircraft', kind: 'anim', prompt: `${PLACE} Aircraft manufacturing: a small jet trainer airplane on an assembly stand. (항공기 제조)` },
  { name: 'ind-logistics', kind: 'anim', prompt: `${PLACE} A logistics warehouse: a tall shelf rack with cardboard boxes. (물류센터)` },
  { name: 'ind-autoparts', kind: 'anim', prompt: `${PLACE} An auto parts factory: a car seat and a gear on a small conveyor. (자동차 부품 공장)` },
  { name: 'ind-ess', kind: 'anim', prompt: `${PLACE} A battery energy storage (ESS) factory: a big battery cabinet with a lightning bolt. (배터리 ESS 공장)` },
  { name: 'ind-material', kind: 'anim', prompt: `${PLACE} A battery materials plant: a lab flask with green liquid next to a small battery cell. (배터리 소재 공장)` },
  { name: 'ind-shipyard', kind: 'anim', prompt: `${PLACE} A shipyard: a large ship hull with welding sparks. (조선소)` },
  { name: 'ind-school', kind: 'anim', prompt: `${PLACE} A school cafeteria kitchen: a lunch tray with rice, soup and side dishes and a big cooking pot. (학교 급식실)` },
  { name: 'ind-factory', kind: 'anim', prompt: `${PLACE} A general manufacturing factory: a small factory building with a gear and a chimney. (제조 공장)` },
  { name: 'ind-training', kind: 'anim', prompt: `${PLACE} Vocational training: a graduation cap on top of a wrench. (직업 교육)` },
  { name: 'ind-battery', kind: 'anim', prompt: `${PLACE} A battery cell factory: a big cylindrical battery cell with a plus sign. (배터리 공장)` },
  { name: 'ind-steel', kind: 'anim', prompt: `${PLACE} A steel mill: a blast furnace pouring glowing orange molten iron. (제철소)` },
  { name: 'ind-police', kind: 'anim', prompt: `${PLACE} Police: a police cap with a badge and a small blue-red siren light. (경찰)` },
  { name: 'ind-defense', kind: 'anim', prompt: `${PLACE} Defense industry: a military helmet with a camouflage pattern and a medal. (방위산업)` },
  { name: 'ind-fire', kind: 'anim', prompt: `${PLACE} Firefighting: a firefighter helmet with a fire extinguisher. (소방)` },
  { name: 'ind-chicken', kind: 'anim', prompt: `${PLACE} A fried chicken shop: a basket of golden fried chicken drumsticks with a small shop awning. (치킨집)` },
  { name: 'ind-auto', kind: 'anim', prompt: `${PLACE} A car factory: a small car on an assembly line. (자동차 공장)` },

  // 손님 6장 (한 장씩, 애니메이션 없음). 웃는 얼굴을 먼저 그리고, 나머지는 그 그림을 참고해서 같은 사람으로
  { name: 'face-worker-smile', kind: 'still', prompt: `${WORKER} Pose and expression: pleased and polite, warm smile, hands together in front, waiting happily.` },
  { name: 'face-worker-neutral', kind: 'still', ref: 'face-worker-smile', prompt: `${WORKER} Pose and expression: bored, flat mouth, half-closed eyes, arms crossed, tapping one foot.` },
  { name: 'face-worker-frown', kind: 'still', ref: 'face-worker-smile', prompt: `${WORKER} Pose and expression: annoyed frown, eyebrows down, looking at a wristwatch, a sweat drop on the head.` },
  { name: 'face-worker-angry', kind: 'still', ref: 'face-worker-smile', prompt: `${WORKER} Pose and expression: furious, bright red face, steam puffing from the head, shaking a fist, stomping one foot.` },
  { name: 'face-worker-delight', kind: 'still', ref: 'face-worker-smile', prompt: `${WORKER} Pose and expression: overjoyed, both arms raised, sparkling eyes, huge open-mouth grin, jumping a little.` },
  { name: 'face-worker-tear', kind: 'still', ref: 'face-worker-smile', prompt: `${WORKER} Pose and expression: sad, shoulders slumped, one big tear rolling down the cheek, holding a handkerchief.` },
  { name: 'face-cook-smile', kind: 'still', prompt: `${COOK} Pose and expression: pleased and polite, warm smile, hands together in front, waiting happily.` },
  { name: 'face-cook-neutral', kind: 'still', ref: 'face-cook-smile', prompt: `${COOK} Pose and expression: bored, flat mouth, half-closed eyes, arms crossed, tapping one foot.` },
  { name: 'face-cook-frown', kind: 'still', ref: 'face-cook-smile', prompt: `${COOK} Pose and expression: annoyed frown, eyebrows down, looking at a wristwatch, a sweat drop on the head.` },
  { name: 'face-cook-angry', kind: 'still', ref: 'face-cook-smile', prompt: `${COOK} Pose and expression: furious, bright red face, steam puffing from the head, shaking a fist, stomping one foot.` },
  { name: 'face-cook-delight', kind: 'still', ref: 'face-cook-smile', prompt: `${COOK} Pose and expression: overjoyed, both arms raised, sparkling eyes, huge open-mouth grin, jumping a little.` },
  { name: 'face-cook-tear', kind: 'still', ref: 'face-cook-smile', prompt: `${COOK} Pose and expression: sad, shoulders slumped, one big tear rolling down the cheek, holding a handkerchief.` },
  { name: 'face-suitf-smile', kind: 'still', prompt: `${SUITF} Pose and expression: pleased and polite, warm smile, hands together in front, waiting happily.` },
  { name: 'face-suitf-neutral', kind: 'still', ref: 'face-suitf-smile', prompt: `${SUITF} Pose and expression: bored, flat mouth, half-closed eyes, arms crossed, tapping one foot.` },
  { name: 'face-suitf-frown', kind: 'still', ref: 'face-suitf-smile', prompt: `${SUITF} Pose and expression: annoyed frown, eyebrows down, looking at a wristwatch, a sweat drop on the head.` },
  { name: 'face-suitf-angry', kind: 'still', ref: 'face-suitf-smile', prompt: `${SUITF} Pose and expression: furious, bright red face, steam puffing from the head, shaking a fist, stomping one foot.` },
  { name: 'face-suitf-delight', kind: 'still', ref: 'face-suitf-smile', prompt: `${SUITF} Pose and expression: overjoyed, both arms raised, sparkling eyes, huge open-mouth grin, jumping a little.` },
  { name: 'face-suitf-tear', kind: 'still', ref: 'face-suitf-smile', prompt: `${SUITF} Pose and expression: sad, shoulders slumped, one big tear rolling down the cheek, holding a handkerchief.` },
  { name: 'face-trump-smile', kind: 'still', prompt: `${TRUMP} Pose and expression: pleased and polite, warm smile, hands together in front, waiting happily.` },
  { name: 'face-trump-neutral', kind: 'still', ref: 'face-trump-smile', prompt: `${TRUMP} Pose and expression: bored, flat mouth, half-closed eyes, arms crossed, tapping one foot.` },
  { name: 'face-trump-frown', kind: 'still', ref: 'face-trump-smile', prompt: `${TRUMP} Pose and expression: annoyed frown, eyebrows down, looking at a wristwatch, a sweat drop on the head.` },
  { name: 'face-trump-angry', kind: 'still', ref: 'face-trump-smile', prompt: `${TRUMP} Pose and expression: furious, bright red face, steam puffing from the head, shaking a fist, stomping one foot.` },
  { name: 'face-trump-delight', kind: 'still', ref: 'face-trump-smile', prompt: `${TRUMP} Pose and expression: overjoyed, both arms raised, sparkling eyes, huge open-mouth grin, jumping a little.` },
  { name: 'face-trump-tear', kind: 'still', ref: 'face-trump-smile', prompt: `${TRUMP} Pose and expression: sad, shoulders slumped, one big tear rolling down the cheek, holding a handkerchief.` },
  { name: 'face-smile', kind: 'still', prompt: `${CLIENT} Pose and expression: pleased and polite, warm smile, hands clasped in front, waiting happily.` },
  { name: 'face-neutral', kind: 'still', ref: 'face-smile', prompt: `${CLIENT} Pose and expression: bored, flat mouth, half-closed eyes, arms crossed, tapping one foot.` },
  { name: 'face-frown', kind: 'still', ref: 'face-smile', prompt: `${CLIENT} Pose and expression: annoyed frown, eyebrows down, looking at his wristwatch, a sweat drop on his head.` },
  { name: 'face-angry', kind: 'still', ref: 'face-smile', prompt: `${CLIENT} Pose and expression: furious, bright red face, steam puffing from his head, shaking a fist, stomping one foot.` },
  { name: 'face-delight', kind: 'still', ref: 'face-smile', prompt: `${CLIENT} Pose and expression: overjoyed, both arms raised, sparkling eyes, huge open-mouth grin, jumping a little.` },
  { name: 'face-tear', kind: 'still', ref: 'face-smile', prompt: `${CLIENT} Pose and expression: sad, shoulders slumped, one big tear rolling down his cheek, holding a handkerchief.` },
];

// ───────── API ─────────
const sleep = ms => new Promise(r => setTimeout(r, ms));
const exists = p => access(p).then(() => true, () => false);
async function pngBlob(path) { return new Blob([await readFile(path)], { type: 'image/png' }); }

// images/edits: 참고 그림(들)과 프롬프트로 새 그림
async function edit(images, prompt) {
  for (let attempt = 1; ; attempt++) {
    const fd = new FormData();
    fd.append('model', 'gpt-image-1');
    fd.append('prompt', prompt);
    fd.append('size', '1024x1024');
    fd.append('quality', QUALITY);
    fd.append('background', 'transparent');
    fd.append('output_format', 'png');
    fd.append('input_fidelity', 'high');
    for (const [i, p] of images.entries()) fd.append('image[]', await pngBlob(p), `ref${i}.png`);
    const res = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: fd });
    if (res.ok) { const j = await res.json(); addCost(j.usage); return Buffer.from(j.data[0].b64_json, 'base64'); }
    const msg = await res.text();
    if ((res.status === 429 || res.status >= 500) && attempt < 5) { await sleep(2000 * 2 ** attempt); continue; }
    throw new Error(`${res.status} ${msg.slice(0, 300)}`);
  }
}

// ───────── 비용 기록: API가 알려 주는 토큰 사용량으로 계산해서 assets/cost-log.json에 누적 ─────────
// gpt-image-1 가격(1M 토큰당): 글자 입력 $5, 그림 입력 $10, 그림 출력 $40
const PRICE = { text: 5 / 1e6, image: 10 / 1e6, out: 40 / 1e6 };
const COST_FILE = join(OUT, 'cost-log.json');
let costLog = { total_usd: 0, images: 0, runs: [] };
try { costLog = JSON.parse(await readFile(COST_FILE, 'utf8')); } catch (e) {}
const run = { started: new Date().toISOString(), only: ONLY, quality: QUALITY, images: 0, usd: 0 };
costLog.runs.push(run);
function addCost(u) {
  if (!u) return;
  const d = u.input_tokens_details || {};
  const text = d.text_tokens ?? 0, image = d.image_tokens ?? Math.max(0, (u.input_tokens || 0) - text);
  const usd = text * PRICE.text + image * PRICE.image + (u.output_tokens || 0) * PRICE.out;
  run.images++; run.usd = +(run.usd + usd).toFixed(4);
  costLog.images++; costLog.total_usd = +(costLog.total_usd + usd).toFixed(4);
  writeFile(COST_FILE, JSON.stringify(costLog, null, 1)).catch(() => {});
  console.log(`  $${usd.toFixed(3)} (이번 실행 $${run.usd.toFixed(2)}, 누적 $${costLog.total_usd.toFixed(2)})`);
}

const REFS = [join(OUT, 'style', 'ref-drone.png'), join(OUT, 'style', 'ref-monster.png')];
// b프레임: 찌그러뜨리거나 기울이지 않고, 몸의 일부만 움직인 모습 (팔이 위아래로, 얼굴이 바뀌고, 다리가 제자리걸음)
const frameB = move => [
  'Second frame of a 2-frame idle loop animation.',
  'Redraw the EXACT same subject from the input image: same design, same colors, same outline thickness, the SAME size, the SAME proportions and the SAME position in the canvas.',
  'Do NOT squash, stretch, tilt, rotate or scale the whole subject.',
  'Keep the same thick BLACK outlines and the same solid, fully opaque colors as the input (do not make it pale, faded, washed out or see-through).',
  `Only change this: ${move || 'one small part moves slightly (a light blinks or a joint moves a little)'}.`,
  'Fully transparent background. No text.',
].join(' ');

async function make(item) {
  const a = join(OUT, item.kind === 'still' ? `${item.name}.png` : `${item.name}-a.png`);
  // ref가 있으면 그 그림을 첫 참고 이미지로 넣어서 같은 인물로 그림
  const refs = item.ref && (await exists(join(OUT, `${item.ref}.png`))) ? [join(OUT, `${item.ref}.png`), REFS[0]] : REFS;
  const b = join(OUT, `${item.name}-b.png`);
  if (FORCE || !(await exists(a))) {
    const how = refs === REFS ? 'Use the reference images only for the art style, not for the subject.' : (item.kind === 'anim' ? 'The first reference image shows the base robot: keep exactly the same robot body, base, colors (white and light gray with orange lights), face and art style; only replace the tool at the end of the arm as described. ' : 'The first reference image shows this exact character: keep the same person, face, hair, outfit, accessories and colors; only change the pose and expression. ') + ' Do not add any facial feature that the first image does not have (for example, if it has no nose, do not draw a nose). Use the other image only for the art style.';
    await writeFile(a, await edit(refs, `${STYLE}\n\nDraw: ${item.prompt}\n\n${how}`));
    console.log('✓', a.replace(ROOT + '/', ''));
  }
  if (item.kind === 'anim' && item.move !== undefined && (FORCE || FORCE_B || !(await exists(b)))) {
    await writeFile(b, await edit([a], frameB(item.move)));
    console.log('✓', b.replace(ROOT + '/', ''));
  }
}

await mkdir(OUT, { recursive: true });
// 여러 개는 쉼표로: robot-q,tile-wheel
const todo = ITEMS.filter(it => ONLY.split(',').some(k => it.name.includes(k)));
const total = todo.reduce((n, it) => n + (it.kind === 'anim' ? 2 : 1), 0);
console.log(`그림 ${todo.length}종, 최대 ${total}장 (quality=${QUALITY})`);
let next = 0, failed = 0;
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (next < todo.length) {
    const it = todo[next++];
    try { await make(it); } catch (e) { failed++; console.error('✗', it.name, e.message); }
  }
}));
console.log(failed ? `실패 ${failed}종. 같은 명령을 다시 돌리면 없는 것만 다시 그려요.` : '끝!');
