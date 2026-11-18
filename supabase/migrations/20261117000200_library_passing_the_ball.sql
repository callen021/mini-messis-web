-- Practice library item: Passing the Ball (soccer, Fundamentals), from the "Pass & Move!" sheet
-- (D125). Inserted unpublished; the teaching text is the sheet's own, the wrong-vs-right pairs
-- were drafted from it and approved by the user.

insert into public.library_items (slug, sport, category, title, age_min, age_max, sort_order, is_published, content)
values ('passing-the-ball', 'soccer', 'fundamentals', 'Passing the Ball', 6, 10, 20, false, $json$
{
  "learn": {
    "tagline": "Pass & Move!",
    "focus": "Open your body, plant beside the ball, use the inside of your foot, pass through the middle, and move after the pass.",
    "steps": [
      {
        "title": "Look Up",
        "text": "See your target before you pass. Stand balanced and get your body ready to play the ball.",
        "image": { "path": "passing-the-ball/step-1.webp", "width": 284, "height": 306 }
      },
      {
        "title": "Plant Beside",
        "text": "Put your LEFT foot next to the ball. Point your toes where you want the pass to go.",
        "image": { "path": "passing-the-ball/step-2.webp", "width": 266, "height": 306 }
      },
      {
        "title": "Open Your Foot",
        "text": "Turn your RIGHT foot out. Keep your ankle firm and show the inside of your foot to the ball.",
        "image": { "path": "passing-the-ball/step-3.webp", "width": 266, "height": 306 }
      },
      {
        "title": "Pass Through",
        "text": "Use the inside of your foot to pass through the middle of the ball. Keep it smooth and controlled.",
        "image": { "path": "passing-the-ball/step-4.webp", "width": 272, "height": 306 }
      },
      {
        "title": "Move After",
        "text": "Step toward your target after the pass. Follow your pass and get ready for the next play.",
        "image": { "path": "passing-the-ball/step-5.webp", "width": 274, "height": 306 }
      }
    ],
    "cues": [
      "Point your plant foot at the target.",
      "Use the inside of your foot for control.",
      "Keep your ankle firm and your pass smooth.",
      "Pass, then move to help your teammate."
    ],
    "compare": [
      { "wrong": "Passing without looking.", "right": "See your target first." },
      { "wrong": "Plant foot pointing away from the target.", "right": "Plant foot pointing at the target." },
      { "wrong": "A floppy ankle.", "right": "A firm ankle." },
      { "wrong": "Jabbing at the ball.", "right": "A smooth pass through the middle of the ball." },
      { "wrong": "Watching your pass.", "right": "Pass, then move." }
    ],
    "big_picture": "Great passers keep the ball moving. Accurate passes help your team keep possession, find teammates, and build the next attack."
  },
  "setup": {
    "params": [
      { "key": "cones", "label": "Cones", "type": "count", "default": 4 },
      { "key": "length", "label": "Length", "type": "distance", "default": 8, "min": 5, "max": 10, "adjustable": true },
      { "key": "width", "label": "Width", "type": "distance", "default": 5, "min": 3, "max": 8, "adjustable": true },
      { "key": "players", "label": "Players", "type": "text", "default": "2 passers" },
      { "key": "duration", "label": "Duration", "type": "duration", "default": null, "min": 5, "max": 30, "step": 5, "adjustable": true }
    ],
    "diagram": {
      "elements": [
        { "type": "cones", "id": "a", "from": [0, 0], "step": [1.8, 0], "count": 2 },
        { "type": "cones", "id": "b", "from": [0, 1], "step": [1.8, 0], "count": 2 },
        { "type": "measure", "from": "b0", "to": "b1", "label": "$length", "side": "below" },
        { "type": "measure", "from": "a0", "to": "b0", "label": "$width", "side": "left" },
        { "type": "player", "id": "passer", "role": "passer", "label": "Passer", "at": [0.35, 0.5] },
        { "type": "player", "id": "partner", "role": "receiver", "label": "Partner", "at": [1.45, 0.5] },
        { "type": "arrow", "kind": "pass", "from": "passer", "to": "partner" }
      ]
    },
    "goal": "Accurate passes and clean first touches.",
    "steps": [
      "Set up with a partner 5–8 yards apart.",
      "Pass with the inside of your foot.",
      "Trap the ball, then pass it back.",
      "Count 10 clean passes, then switch feet."
    ],
    "equipment": ["4 cones", "One ball per pair"]
  }
}
$json$::jsonb)
on conflict (slug) do nothing;
