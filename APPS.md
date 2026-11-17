# Freefield apps — what each one does and how to call it

121 apps. Generated from `apps/*/app.json` and the files on the `freefield-models` Modal volume (regenerate after downloading packs). `*` = required input.

**Status on your backend:** ✅ runnable now: 97 · ⬇ needs a pack download: 23 · 🔒 needs a Hugging Face licence: 0 · 📝 draft: 1

> ✅ means the app's models are on your volume, **not** that it has been run on your backend. Tested so far:
>
> | App | Result |
> |---|---|
> | `video-t2v` | ✅ 10 s clip, 1280×704, 24 fps, with audio — 239 s including a cold start |
> | `upscale-video` | ❌ crashed (CUDA illegal memory access in SeedVR2) on that 10 s clip (doubled to 2560×1408, temporal chunking off in the workflow). A 2 s trim **worked** in 354 s incl. cold start |
> | `upscale-video-fast` | ✅ new (Real-ESRGAN ×2): the same 10 s clip → 2560×1408 with audio, 95 s on the GPU (plus ~55 s cold start) |

## How to access any app

Every app takes the same three routes. Inputs are the ids in the tables below; file inputs (image/video/audio) are uploads.

**1. Command line** (from the repo, uses `.env`):
```bash
npm run apps                                                   # list all apps + status
npm run app -- video-t2v --set prompt="calm lake at dawn" --set duration=10 --out ./out
npm run app -- upscale-video --file clip=./in.mp4 --out ./out    # file inputs use --file
```

**2. Web UI:** `npm run serve` → http://127.0.0.1:3000 (pick an app, fill the form, Generate).

**3. HTTP API** (what `npm run serve` exposes; scripts and yt-daily-stream will use this):

| Call | What it does |
|---|---|
| `GET /api/apps` | All apps with their inputs, defaults and options |
| `POST /api/apps/{id}/run` | Start a run. Body is **multipart form**: one field per input id (files as uploads), optional `preset`. Returns 202 + run id |
| `GET /api/history/{runId}` | Run status and output file names |
| `GET /api/history/{runId}/files/{name}` | Download an output |
| `POST /api/history/{runId}/cancel` · `DELETE /api/history/{runId}` | Cancel / delete a run |
| `GET /api/history?app={id}` | Past runs |
| `GET /api/gpu` · `POST /api/gpu/wake` | GPU state / start the GPU ahead of a batch |
| `GET /api/apps/{id}/workflow` | The app's ComfyUI workflow JSON (open it in ComfyUI) |

```bash
curl -F prompt='calm lake at dawn' -F duration=10 http://127.0.0.1:3000/api/apps/video-t2v/run
curl -F clip=@in.mp4 http://127.0.0.1:3000/api/apps/upscale-video/run
```

> Today the server has no API key: it's open on localhost only. Adding a key (step 5 of PLAN.md) is what makes it safe on the VPS.

## Image (70)

| App id | Name | What it does | Inputs | Status |
|---|---|---|---|---|
| `ai-influencer` | AI Influencer | Build a made-up influencer trait by trait: type, body, hair, face, style and scene (FLUX 3 Klein). | `kind` (select), `gender` (select), `age` (select), `origin` (select), `skin` (select), `build` (select), `stature` (select), `proportions` (select), `hair` (select), `haircolor` (select), `head` (select), `neck` (select), `eyes` (select), `eyecolor` (select), `feature` (select), `facialhair` (select), `trait` (select), `style` (select), `accessory` (select), `scene` (select), `details` (text), `aspect` (select), `resolution` (select), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `ai-influencer-photo` | AI Influencer · Your Photo | Your own face as the influencer: change hair, style, extras and scene, the face stays (FLUX 3 Klein, one reference). | `image`* (image), `hair` (select), `haircolor` (select), `build` (select), `facialhair` (select), `feature` (select), `trait` (select), `style` (select), `accessory` (select), `scene` (select), `details` (text), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `angles` | Angles | The same scene from another camera position: move, rotate, look down (Multiple Angles LoRA on Qwen-Image-Edit). | `image`* (image), `move` (select), `details` (textarea), `seed` (seed) | ⬇ download `image-qwen-edit` pack (31.15 GB missing) |
| `billboard` | Billboard | Your photo on a giant lit billboard over a city street. | `image`* (image), `where` (select), `details` (textarea), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `breakdown` | Breakdown | The subject of your photo taken apart into labeled components, knolling style. | `image`* (image), `details` (textarea), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `brick-toy` | Brick Toy | The subject of your photo rebuilt from interlocking plastic bricks. | `image`* (image), `details` (textarea), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `burning-sunset` | Burning Sunset | Your scene under a blazing sunset sky. | `image`* (image), `details` (textarea), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `cafe-60s` | 60s Cafe | You in a 1960s cafe: period clothes, chrome counter, film grain. | `image`* (image), `details` (textarea), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `character` | Consistent Character | Puts the person from your reference photo into a new scene and keeps their look (FLUX 3 Image Klein). | `reference`* (image), `scene`* (textarea), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `character-3` | Character (3 Photos) | The person from three of your photos in a new scene: more angles of one face keep the likeness closer (FLUX 3 Image Klein). | `photo1`* (image), `photo2`* (image), `photo3`* (image), `scene`* (textarea), `aspect` (select), `resolution` (select), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `character-swap` | Character Swap | Replaces the person in a scene with the person from a second photo. | `image`* (image), `image2`* (image), `details` (textarea), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `cinema-studio` | Cinema Studio | Pick genre, era, camera body, lens, focal length, aperture, lighting and color palette; they become part of the prompt. | `prompt`* (textarea), `genre` (select), `era` (select), `camera` (select), `lens` (select), `focal` (select), `aperture` (select), `lighting` (select), `palette` (select), `aspect` (select), `resolution` (select), `seed` (seed) | ✅ runnable now |
| `color-grade` | Color Grade | Six color grades for a photo: teal and orange, vintage film, noir, pastel, B&W, golden hour. | `image`* (image), `look` (select), `details` (textarea), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `comic-book` | Comic Book | Your photo as a comic book panel: ink lines, halftone, a caption box. | `image`* (image), `details` (textarea), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `commercial-faces` | Commercial Faces | Campaign portraits of you: skincare, corporate, sportswear or editorial. | `image`* (image), `use` (select), `details` (textarea), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `create-image` | Create Image | Text to image with FLUX 3 Image Klein: aspect ratio, 1K to 2K, a photographic look, and a 9B upsampler that can expand your prompt. | `prompt`* (textarea), `expand` (toggle), `look` (select), `aspect` (select), `resolution` (select), `steps` (slider), `seed` (seed) | ⬇ download `image-flux3` pack (6.72 GB missing) |
| `depth-map` | Depth Map | A depth map (or a normal map) of any photo, from MoGe-2's geometry estimate. | `image`* (image), `map` (select), `detail` (slider) | ✅ runnable now |
| `edit` | Edit Image | Describe a change and FLUX 3 Image Klein applies it to your photo. | `image`* (image), `instruction`* (textarea), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `edit-text` | Edit Text | Replaces the text written in an image, keeping the font and perspective. | `image`* (image), `old`* (text), `new`* (text), `details` (textarea), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `expand-image` | Expand Image | Grows a photo past its edges: FLUX 3 Image Klein draws only the new border, so the original stays as it was. | `image`* (image), `direction` (select), `details` (textarea), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `face-swap` | Face Swap | Puts the face from a second photo onto the first; for faces you own or have permission to use. | `image`* (image), `image2`* (image), `details` (textarea), `steps` (slider), `seed` (seed) | ⬇ download `image-flux3` pack (0.01 GB missing) |
| `fashion-factory` | Fashion Factory | A fashion catalog photo of you wearing a garment from a second photo. | `image`* (image), `image2`* (image), `scene` (select), `details` (textarea), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `figure-3d` | 3D Figure | Your photo as a collectible figure in a blister pack on a shelf. | `image`* (image), `details` (textarea), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `fridge-ad` | Fridge Ad | Your product inside an illuminated display fridge, condensation on the glass. | `image`* (image), `details` (textarea), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `game-styles` | Game Styles | You as a character in 12 kinds of video game, from 16-bit pixel art to voxel worlds. | `image`* (image), `style` (select), `details` (textarea), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `giallo` | Giallo Horror | A 1970s Italian giallo film still: red and blue gels, deep shadows, no blood. | `image`* (image), `details` (textarea), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `giant-product` | Giant Product | Your product as a giant monument over a city skyline, people tiny at its base. | `image`* (image), `time` (select), `details` (textarea), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `glitter-sticker` | Glitter Sticker | You as a glossy glitter sticker with a white die-cut border. | `image`* (image), `details` (textarea), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `graffiti-ad` | Graffiti Ad | Your product as a spray-paint graffiti mural on a brick wall. | `image`* (image), `details` (textarea), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `headshot` | Studio Headshot | A professional studio headshot from one selfie: backdrop and outfit of your choice. | `image`* (image), `backdrop` (select), `outfit` (select), `details` (textarea), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `image-effects` | Image Effects | Ten effects for a photo: glitch, double exposure, neon, sketch, watercolor and more. | `image`* (image), `effect` (select), `details` (textarea), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `inpaint` | Inpaint | Paint over the part of a photo to change and describe the change; FLUX 3 Image Klein redraws only what you painted. | `image`* (image), `mask`* (image), `instruction`* (textarea), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `j-magazine` | J-Magazine | You on the cover of a Japanese fashion magazine. | `image`* (image), `details` (textarea), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `j-poster` | J-Poster | A Japanese-style graphic poster of you. | `image`* (image), `details` (textarea), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `japanese-show` | Japanese Show | You on a retro Japanese TV variety show, 4-panel screen. | `image`* (image), `details` (textarea), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `macro-product` | Macro Product | A macro photograph of one detail of your product: texture, edges and label filling the frame. | `image`* (image), `details` (textarea), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `macro-scene` | Macro Scene | An extreme macro close-up of your product in a natural setting: stone, leaves, sand or ice. | `image`* (image), `setting` (select), `details` (textarea), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `mascot` | Mascot | You in a football club mascot costume on the pitch. | `image`* (image), `animal` (select), `details` (textarea), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `meme` | Meme Generator | A meme image from a scene and two captions (FLUX 3 Klein). | `scene`* (textarea), `top`* (text), `bottom`* (text), `details` (textarea), `aspect` (select), `resolution` (select), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `micro-beasts` | Micro-Beasts | You surrounded by tiny cute animals. | `image`* (image), `animals` (select), `details` (textarea), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `moodboard` | Moodboard | Anything you describe, in the look three reference images share: palette, light, texture and mood, like a moodboard (FLUX 3 Image Klein). | `style1`* (image), `style2`* (image), `style3`* (image), `prompt`* (textarea), `aspect` (select), `resolution` (select), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `moss-image` | Layout Image | Text to image with MOSS-Image (Apache-2.0); also takes a layout JSON that places each text and object in its own box. | `prompt`* (textarea), `rewrite` (toggle), `width` (select), `height` (select), `steps` (slider), `seed` (seed) | 📝 draft (not GPU-tested upstream) |
| `mural` | Street Mural | You hand-painted on a large street mural. | `image`* (image), `details` (textarea), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `outfit-shot` | Outfit Shot | A studio fashion shot of a garment on a model from your photo. | `image`* (image), `image2`* (image), `pose` (select), `details` (textarea), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `outfit-swap` | Outfit Swap | Wear the whole outfit of the person in another photo. | `image`* (image), `image2`* (image), `details` (textarea), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `outfit-vending` | Outfit Vending | The clothes you are wearing, displayed item by item inside a lit vending machine. | `image`* (image), `details` (textarea), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `packshot` | Packshot | The closing frame of an ad: your product centered on a clean gradient with room for a tagline. | `image`* (image), `backdrop` (select), `details` (textarea), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `paint-app` | Paint App | Your photo redrawn in a 1990s computer paint program. | `image`* (image), `details` (textarea), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `photodump` | Photodump | Four photos of you from one photo, in four scenes of an aesthetic, like a feed photo dump, in one run (FLUX 3 Image Klein). | `photo`* (image), `aesthetic` (select), `details` (text), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `pixel-game` | Pixel Game | Your scene redrawn as 16-bit pixel art with a game HUD. | `image`* (image), `details` (textarea), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `plushie` | Plushie | The subject of your photo remade as a soft plush toy. | `image`* (image), `details` (textarea), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `poster` | Poster | Turns a product photo into a printed advertising poster with your headline (FLUX 3 Image Klein). | `image`* (image), `headline`* (text), `details` (textarea), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `product-shot` | Product Shot | Turns a plain photo of a product into a styled product shot: pedestal, splash, beach and more. | `product`* (image), `scene` (select), `details` (textarea), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `relight` | Relight | Relights a photo with a preset light or your own direction, softness, brightness and color, keeping the scene intact. | `image`* (image), `light` (select), `direction` (select), `quality` (select), `brightness` (select), `color` (select), `details` (textarea), `seed` (seed) | ⬇ download `image-qwen-edit` pack (31.15 GB missing) |
| `remove-bg` | Remove Background | Cuts out the subject with BiRefNet and returns a PNG with transparency. | `image`* (image) | ✅ runnable now |
| `renaissance` | Renaissance | You as a Renaissance oil painting in a gilded museum frame. | `image`* (image), `details` (textarea), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `render-3d` | 3D Render | A stylized 3D render of your photo: clay-like materials, soft studio light. | `image`* (image), `details` (textarea), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `shots` | Shots | Nine framings of one image: wide, close-up, top-down, low angle and rotations. | `image`* (image), `shot` (select), `details` (textarea), `seed` (seed) | ⬇ download `image-qwen-edit` pack (31.15 GB missing) |
| `sketch-to-real` | Sketch to Real | Turns a sketch into a photorealistic photo of the same scene. | `image`* (image), `details` (textarea), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `skin-enhancer` | Skin Enhancer | A beauty-editor retouch: even tone, natural pores kept, no plastic smoothing. | `image`* (image), `details` (textarea), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `style-reference` | Style Reference | Paints anything you describe in the style of a reference image (Krea 2 Turbo with a style-reference LoRA). | `style`* (image), `prompt`* (textarea), `enhance` (toggle), `aspect` (select), `megapixels` (slider), `seed` (seed) | ⬇ download `image-krea2` pack (19.44 GB missing) |
| `style-snap` | Style Snap | You in a complete new outfit: streetwear, business, gala, athleisure, 70s or monochrome. | `image`* (image), `style` (select), `details` (textarea), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `styles` | Styles | Text to image in one of Krea's nine official looks: watercolor, ink wash, retro anime, tarot and more. | `prompt`* (textarea), `style` (select), `strength` (slider), `enhance` (toggle), `aspect` (select), `megapixels` (slider), `seed` (seed) | ⬇ download `image-krea2` pack (23.21 GB missing) |
| `try-on` | Virtual Try-On | Try a garment on your own photo: same pose, same background, new clothes. | `image`* (image), `image2`* (image), `details` (textarea), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `ugc-shot` | UGC Shot | A casual phone photo of a hand holding your product, like a social media post. | `image`* (image), `where` (select), `details` (textarea), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `upscale` | Upscale Image | SeedVR2 restores detail while enlarging 2× or 4×. | `image`* (image), `scale` (select), `seed` (seed) | ✅ runnable now |
| `victory-card` | Victory Card | Your face on a playing card in a winning poker hand. | `image`* (image), `details` (textarea), `steps` (slider), `seed` (seed) | ✅ runnable now |
| `whats-next` | What's Next | The next shot of your scene: 8 cinematic continuations (next-scene LoRA on Qwen-Image-Edit). | `image`* (image), `next` (select), `details` (textarea), `seed` (seed) | ⬇ download `image-qwen-edit` pack (31.21 GB missing) |
| `z-image` | Z-Image Turbo | Fast text to image with Z-Image Turbo, 8 steps; the lab makes its reference photos with it. | `prompt`* (textarea), `width` (select), `height` (select), `steps` (slider), `seed` (seed) | ⬇ download `image` pack (12.17 GB missing) |
| `zooms` | Zooms | Zoom levels of one image, from a wide view to an extreme close-up. | `image`* (image), `zoom` (select), `details` (textarea), `seed` (seed) | ⬇ download `image-qwen-edit` pack (31.15 GB missing) |

## Video (46)

| App id | Name | What it does | Inputs | Status |
|---|---|---|---|---|
| `asmr-host` | ASMR Host | You hosting an ASMR studio with a big microphone and fairy lights. | `image`* (image), `details` (textarea), `duration` (slider), `enhance` (toggle), `aspect` (select), `seed` (seed) | ✅ runnable now |
| `asmr-product` | ASMR Product | Your product in an ASMR clip: tapping, scratching, no music. | `image`* (image), `details` (textarea), `duration` (slider), `enhance` (toggle), `aspect` (select), `seed` (seed) | ✅ runnable now |
| `asmr-whisper` | ASMR Whisper | You whispering and tapping in a classic ASMR clip. | `image`* (image), `details` (textarea), `duration` (slider), `enhance` (toggle), `aspect` (select), `seed` (seed) | ✅ runnable now |
| `behind-the-scenes` | Behind the Scenes | The camera pulls back from your photo to reveal the film set around it. | `image`* (image), `details` (textarea), `duration` (slider), `enhance` (toggle), `aspect` (select), `seed` (seed) | ✅ runnable now |
| `bullet-time-scene` | Bullet Time Scene | Freezes the moment and circles the camera around the subject, in their own scene (Wan 2.1 + Bullet Time LoRA). | `image`* (image), `subject`* (text), `details` (textarea), `strength` (slider), `aspect` (select), `frames` (select), `seed` (seed) | ⬇ download `video-wan-effects` pack (25.75 GB missing) |
| `bullet-time-splash` | Bullet Time Splash | Bursts frozen water around the subject, then circles the camera through the suspended drops. | `image`* (image), `subject`* (text), `details` (textarea), `strength` (slider), `aspect` (select), `frames` (select), `seed` (seed) | ⬇ download `video-wan-effects` pack (25.75 GB missing) |
| `bullet-time-white` | Bullet Time White | Puts the subject mid-jump on a white studio backdrop, then freezes time and circles the camera around them. | `image`* (image), `subject`* (text), `details` (textarea), `strength` (slider), `aspect` (select), `frames` (select), `seed` (seed) | ⬇ download `video-wan-effects` pack (25.75 GB missing) |
| `camera-copy` | Camera Copy | Copies the camera move of any reference clip onto your image: push-ins, pans, orbits, cranes. | `image`* (image), `clip`* (video), `prompt`* (textarea), `negative` (textarea), `hold` (slider), `strength` (slider), `size` (select), `seed` (seed) | ✅ runnable now |
| `camera-moves` | Camera Moves | Animates your image with a precise camera move: pans, zooms and rolls at the speed you pick (Wan 2.2 Fun Camera). | `image`* (image), `prompt`* (textarea), `camera` (select), `speed` (slider), `width` (select), `height` (select), `frames` (select), `seed` (seed) | ⬇ download `video-wan-camera` pack (40.05 GB missing) |
| `chameleon` | Chameleon | A chameleon in your product's colors appears on it; the product stays as it is. | `image`* (image), `colors`* (text), `details` (textarea), `aspect` (select), `duration` (slider), `strength` (slider), `seed` (seed) | ✅ runnable now |
| `cinema-video` | Cinema Studio Video | Cinema Studio in motion: the same film look as the still, then up to three camera moves, a tempo and sound, on LTX-2.5. | `prompt`* (textarea), `moves` (select), `tempo` (select), `genre` (select), `era` (select), `camera` (select), `lens` (select), `focal` (select), `aperture` (select), `lighting` (select), `palette` (select), `aspect` (select), `duration` (slider), `enhance` (toggle), `seed` (seed) | ✅ runnable now |
| `cloud-surf` | Cloud Surf | You surfing across pink clouds at sunset, same face. | `image`* (image), `details` (textarea), `aspect` (select), `duration` (slider), `strength` (slider), `seed` (seed) | ✅ runnable now |
| `dub` | Dub | Makes the person in a clip say new words, in any language: new voice track and new lip movement from your text (DubIt IC-LoRA). | `clip`* (video), `prompt`* (textarea), `negative` (textarea), `size` (select), `strength` (slider), `seed` (seed) | ✅ runnable now |
| `effects` | Effects | Turns a photo into a 5-second effect clip: 24 open effect LoRAs, from Cakeify and a hydraulic press to money rain and a 360° orbit (Wan 2.1 image-to-video). | `image`* (image), `effect` (select), `subject`* (textarea), `details` (textarea), `strength` (slider), `aspect` (select), `frames` (select), `seed` (seed) | ⬇ download `video-wan-effects` pack (34.03 GB missing) |
| `extend-video` | Extend Video | Continues a clip from its last frame with MiniMax H3, sound included, and joins the new part after it. | `clip`* (video), `prompt`* (textarea), `duration` (slider), `steps` (slider), `seed` (seed) | ⬇ download `video-h3` pack (51.53 GB missing) |
| `genjutsu` | Genjutsu | Composes a clip from one reference sheet: people, props, clothes or a place laid out side by side and named by position in the prompt (Ingredients IC-LoRA). | `sheet`* (image), `prompt`* (textarea), `negative` (textarea), `duration` (slider), `size` (select), `strength` (slider), `seed` (seed) | ✅ runnable now |
| `h3-photo` | H3 Photo to Video | Animates a photo into a clip with its own sound on MiniMax H3; the clip keeps the photo's shape. | `image`* (image), `prompt`* (textarea), `duration` (slider), `steps` (slider), `seed` (seed) | ⬇ download `video-h3` pack (51.53 GB missing) |
| `h3-video` | H3 Video | A clip with its own sound from a prompt, on MiniMax H3: speech in quotes, sound effects and music come out of the same model. | `prompt`* (textarea), `aspect` (select), `duration` (slider), `steps` (slider), `seed` (seed) | ⬇ download `video-h3` pack (51.53 GB missing) |
| `idol` | Idol | Your K-pop idol moment: spotlights, wind, confetti, a pose. | `image`* (image), `details` (textarea), `duration` (slider), `enhance` (toggle), `aspect` (select), `seed` (seed) | ✅ runnable now |
| `kick-ad` | Kick Ad | Plain grey boxes slide at your product and get knocked off screen while it stands still. | `image`* (image), `details` (textarea), `duration` (slider), `enhance` (toggle), `aspect` (select), `seed` (seed) | ✅ runnable now |
| `magic-button` | Magic Button | A glowing button turns the scene around your product magical. | `image`* (image), `details` (textarea), `duration` (slider), `enhance` (toggle), `aspect` (select), `seed` (seed) | ✅ runnable now |
| `melting-doodle` | Melting Doodle | Cartoon doodles appear over your photo and melt down the frame. | `image`* (image), `details` (textarea), `duration` (slider), `enhance` (toggle), `aspect` (select), `seed` (seed) | ✅ runnable now |
| `mixed-media` | Mixed Media | Restyles a clip in one of 16 looks: FLUX 3 Klein redraws the first frame in the look, and the clip's edges keep its structure (Union Control IC-LoRA). | `clip`* (video), `style` (select), `details` (textarea), `negative` (textarea), `size` (select), `strength` (slider), `seed` (seed) | ✅ runnable now |
| `morph` | Transformations | Fifteen transformations that keep the face: FLUX 3 Klein redraws the photo (statue, bride, cartoon, clones…) and LTX-2.5 morphs the photo into it. | `image`* (image), `effect` (select), `details` (textarea), `aspect` (select), `duration` (slider), `strength` (slider), `seed` (seed) | ✅ runnable now |
| `motion-transfer` | Motion Transfer | Animates a character image with the motion of a driving clip, with Wan Animate 2. | `character`* (image), `motion`* (video), `character_prompt` (textarea), `action_prompt` (textarea) | ⬇ download `video-wan` pack (24.90 GB missing) |
| `mukbang` | Mukbang | You at a table full of food, eating for the camera. | `image`* (image), `details` (textarea), `duration` (slider), `enhance` (toggle), `aspect` (select), `seed` (seed) | ✅ runnable now |
| `rap-video` | Rap Video | A rap music video of you: low angle, stage lights, smoke, a beat. | `image`* (image), `details` (textarea), `duration` (slider), `enhance` (toggle), `aspect` (select), `seed` (seed) | ✅ runnable now |
| `recast` | Recast | Puts your character into a video in place of the person there, keeping their motion (SCAIL-2 with SAM 3.1 tracking). | `clip`* (video), `character`* (image), `prompt`* (textarea), `target` (text), `mode` (select), `fast` (toggle), `width` (select), `height` (select), `seed` (seed) | ⬇ download `video-scail` pack (28.62 GB missing) |
| `reframe` | Reframe | Changes a clip's aspect ratio by painting what lies beyond the frame, in two stages (Lightricks' In-Outpainting IC-LoRA). | `clip`* (video), `aspect` (select), `prompt` (textarea), `negative` (textarea), `strength` (slider), `seed` (seed) | ✅ runnable now |
| `reshoot` | Re-shoot | Moves the camera to a new angle on an existing clip (MiniMax H3 + MoGe + CrossView). | `clip`* (video), `azimuth` (slider), `elevation` (slider), `distance` (slider), `duration` (slider), `prompt` (textarea), `seed` (seed) | ⬇ download `video-h3` pack (54.09 GB missing) |
| `roller-coaster` | Roller Coaster | You on a roller coaster: the photo turns into the ride, same face. | `image`* (image), `details` (textarea), `aspect` (select), `duration` (slider), `strength` (slider), `seed` (seed) | ✅ runnable now |
| `sdr-hdr` | SDR to HDR | Turns an SDR clip into a 10-bit HLG HDR master with Lightricks' SDR-to-HDR IC-LoRA; a tone-mapped preview comes with it. | `clip`* (video), `size` (select), `exposure` (slider), `strength` (slider), `seed` (seed) | ✅ runnable now |
| `speak` | Speak | A photo says your line out loud: LTX-2.5 makes the voice, the lip sync and the motion in one pass, no TTS model needed. | `image`* (image), `line`* (textarea), `voice` (select), `scene` (textarea), `duration` (slider), `enhance` (toggle), `aspect` (select), `seed` (seed) | ✅ runnable now |
| `storm-creature` | Storm Creature | A giant made of storm clouds and lightning rises behind your scene. | `image`* (image), `details` (textarea), `duration` (slider), `enhance` (toggle), `aspect` (select), `seed` (seed) | ✅ runnable now |
| `talking` | Talking Avatar | A portrait speaks or sings along to your audio, with LTX-2.5 audio-to-video in two stages. | `portrait`* (image), `audio`* (audio), `prompt`* (textarea), `negative` (textarea), `start` (number), `duration` (slider), `enhance` (toggle), `seed` (seed) | ✅ runnable now |
| `transitions` | Transitions | Morphs a first frame into a last frame with a transition LoRA on LTX-2.5. | `first`* (image), `last`* (image), `prompt` (textarea), `strength` (slider), `duration` (slider), `seed` (seed) | ✅ runnable now |
| `truck-ad` | Truck Ad | A toy delivery truck with your product printed on its side drives up and parks beside it. | `image`* (image), `details` (textarea), `duration` (slider), `enhance` (toggle), `aspect` (select), `seed` (seed) | ✅ runnable now |
| `upscale-video` | Upscale Video | SeedVR2 restores and doubles the resolution of a clip. | `clip`* (video), `seed` (seed) | ✅ runnable now |
| `upscale-video-fast` | Upscale Video (fast) | Real-ESRGAN doubles the resolution of a clip frame by frame: much faster than SeedVR2, less restoration. | `clip`* (video) | ✅ runnable now |
| `vfx-clean-plate` | Clean Plate | Removes people and moving subjects from a shot and rebuilds the background. | `clip`* (video), `prompt`* (textarea), `negative` (textarea), `strength` (slider), `size` (select), `seed` (seed) | ✅ runnable now |
| `vfx-day-to-night` | Day to Night | Turns a daytime shot into a believable night version of the same shot. | `clip`* (video), `prompt`* (textarea), `negative` (textarea), `strength` (slider), `size` (select), `seed` (seed) | ✅ runnable now |
| `vfx-water` | Water Simulation | Adds simulated water to a shot, following the scene's geometry. | `clip`* (video), `prompt`* (textarea), `negative` (textarea), `strength` (slider), `size` (select), `seed` (seed) | ✅ runnable now |
| `video` | Image to Video | Animates a still into a shot with synchronized audio, two stages with LTX-2.5. | `image`* (image), `prompt`* (textarea), `duration` (slider), `enhance` (toggle), `aspect` (select), `seed` (seed) | ✅ runnable now |
| `video-remove-bg` | Video Background Remover | Cuts the subject out of every frame of a clip with BiRefNet: the clip over a solid color, with its sound, and the matte for compositing. | `clip`* (video), `background` (select), `seconds` (slider) | ✅ runnable now |
| `video-t2v` | Text to Video | A shot with synchronized audio from a prompt, two stages with LTX-2.5. | `prompt`* (textarea), `duration` (slider), `enhance` (toggle), `aspect` (select), `seed` (seed) | ✅ runnable now |
| `volcano-ad` | Volcano Ad | The background turns into an erupting volcano behind your product. | `image`* (image), `details` (textarea), `aspect` (select), `duration` (slider), `strength` (slider), `seed` (seed) | ✅ runnable now |

## Audio (2)

| App id | Name | What it does | Inputs | Status |
|---|---|---|---|---|
| `music` | Music | A full song from a style description and optional lyrics, with MiniMax Music 3. | `style`* (textarea), `lyrics` (textarea), `seconds` (slider), `seed` (seed) | ⬇ download `audio` pack (14.33 GB missing) |
| `sfx` | Sound Effects | Music beds, instruments, ambiences and one-shots with Stable Audio 3. | `description`* (textarea), `category` (select), `seconds` (slider), `reprompt` (toggle), `seed` (seed) | ⬇ download `audio` pack (14.96 GB missing) |

## Utility (3)

| App id | Name | What it does | Inputs | Status |
|---|---|---|---|---|
| `smoke` | Smoke test | Draws a solid color. Needs no models; proves the whole chain works end to end. | `width` (slider), `height` (slider), `color` (number) | ✅ runnable now |
| `smoke-invert` | Smoke test (file input) | Inverts an uploaded image. Needs no models; proves uploads and downloads work. | `image`* (image) | ✅ runnable now |
| `smooth` | Smooth & Slow-mo | Adds in-between frames with FILM: smoother motion at the same length, or real slow motion. | `clip`* (video), `factor` (select), `mode` (select) | ✅ runnable now |

## Packs (model downloads)

| Pack | Size | Gated | Apps |
|---|---|---|---|
| `audio` | 29.3 GB | no | music, sfx |
| `core` | 0.0 GB | no | smoke, smoke-invert |
| `image` | 12.2 GB | no | z-image |
| `image-flux3` | 17.8 GB | yes | ai-influencer, ai-influencer-photo, billboard, breakdown, brick-toy, burning-sunset, cafe-60s, character, character-3, character-swap, cinema-studio, color-grade, comic-book, commercial-faces, create-image, edit, edit-text, expand-image, face-swap, fashion-factory, figure-3d, fridge-ad, game-styles, giallo, giant-product, glitter-sticker, graffiti-ad, headshot, image-effects, inpaint, j-magazine, j-poster, japanese-show, macro-product, macro-scene, mascot, meme, micro-beasts, moodboard, mural, outfit-shot, outfit-swap, outfit-vending, packshot, paint-app, photodump, pixel-game, plushie, poster, product-shot, renaissance, render-3d, sketch-to-real, skin-enhancer, style-snap, try-on, ugc-shot, victory-card |
| `image-krea2` | 23.7 GB | no | style-reference, styles |
| `image-moss` | 13.0 GB | no | moss-image |
| `image-qwen-edit` | 31.7 GB | no | angles, relight, shots, whats-next, zooms |
| `upscale` | 5.2 GB | no | depth-map, remove-bg, smooth, upscale, upscale-video, upscale-video-fast, video-remove-bg |
| `video-h3` | 75.7 GB | no | extend-video, h3-photo, h3-video, reshoot |
| `video-ltx25` | 66.0 GB | yes | asmr-host, asmr-product, asmr-whisper, behind-the-scenes, camera-copy, chameleon, cinema-video, cloud-surf, dub, genjutsu, idol, kick-ad, magic-button, melting-doodle, mixed-media, morph, mukbang, rap-video, reframe, roller-coaster, sdr-hdr, speak, storm-creature, talking, transitions, truck-ad, vfx-clean-plate, vfx-day-to-night, vfx-water, video, video-t2v, volcano-ad |
| `video-scail` | 28.6 GB | no | recast |
| `video-wan` | 24.9 GB | no | motion-transfer |
| `video-wan-camera` | 40.0 GB | no | camera-moves |
| `video-wan-effects` | 45.1 GB | yes | bullet-time-scene, bullet-time-splash, bullet-time-white, effects |

Download a pack: `modal run infra/modal_app.py::download --pack <pack>`, then stop the warm `serve` container (`modal container list` → `modal container stop -y <id>`) so it sees the new files.
