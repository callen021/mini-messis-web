-- Practice library item: Win It and Keep It (soccer, Fundamentals) (D125). Inserted unpublished;
-- the teaching text is the sheet's own, the wrong-vs-right pairs were drafted from it and approved
-- by the user. The sheet's diagram shows no movement, so the drawn one has no arrows.

insert into public.library_items (slug, sport, category, title, age_min, age_max, sort_order, is_published, content)
values ('win-it-and-keep-it', 'soccer', 'fundamentals', 'Win It and Keep It', 6, 10, 40, false, $json$
{
  "learn": {
    "tagline": "Win it, chase it, keep it!",
    "focus": "Win the ball from the opponent, chase it immediately, get control, and keep possession for your team.",
    "steps": [
      {
        "title": "Win It",
        "text": "Challenge the attacker and poke or tackle the ball into open space.",
        "image": { "path": "win-it-and-keep-it/step-1.webp", "width": 368, "height": 272 }
      },
      {
        "title": "Chase It",
        "text": "Immediately go after the ball — don't stop after you win it!",
        "image": { "path": "win-it-and-keep-it/step-2.webp", "width": 362, "height": 272 }
      },
      {
        "title": "Keep It",
        "text": "Get control of the ball and protect it with your body (keep it away from the opponent).",
        "image": { "path": "win-it-and-keep-it/step-3.webp", "width": 356, "height": 272 }
      },
      {
        "title": "Make a Play",
        "text": "Look up, dribble into space, or pass to a teammate to keep possession and attack!",
        "image": { "path": "win-it-and-keep-it/step-4.webp", "width": 366, "height": 272 }
      }
    ],
    "cues": [
      "Be aggressive, but stay in control.",
      "Go after the ball immediately.",
      "Get your body between the ball and the opponent.",
      "Keep your head up and make a play."
    ],
    "compare": [
      { "wrong": "Stopping after you poke the ball away.", "right": "Go after the ball right away." },
      { "wrong": "Charging in out of control.", "right": "Be aggressive, but stay in control." },
      { "wrong": "Leaving the ball open to the opponent.", "right": "Put your body between the ball and the opponent." },
      { "wrong": "Head down after you win it.", "right": "Head up and make a play." },
      { "wrong": "Kicking the ball away once you have it.", "right": "Dribble into space or pass to a teammate." }
    ],
    "big_picture": "Winning the ball isn't finished until you keep it! Win it, gain control, and turn defense into offense for your team!"
  },
  "setup": {
    "params": [
      { "key": "cones", "label": "Cones", "type": "count", "default": 4 },
      { "key": "length", "label": "Length", "type": "distance", "default": 10, "min": 8, "max": 15, "adjustable": true },
      { "key": "width", "label": "Width", "type": "distance", "default": 5, "min": 3, "max": 8, "adjustable": true },
      { "key": "players", "label": "Players", "type": "text", "default": "2 (1 attacker, 1 defender)" },
      { "key": "duration", "label": "Duration", "type": "duration", "default": null, "min": 5, "max": 30, "step": 5, "adjustable": true }
    ],
    "diagram": {
      "elements": [
        { "type": "cones", "id": "a", "from": [0, 0], "step": [2, 0], "count": 2 },
        { "type": "cones", "id": "b", "from": [0, 1], "step": [2, 0], "count": 2 },
        { "type": "measure", "from": "a0", "to": "a1", "label": "$length", "side": "above" },
        { "type": "measure", "from": "a1", "to": "b1", "label": "$width", "side": "right" },
        { "type": "player", "id": "attacker", "role": "attacker", "label": "Attacker", "at": [0.55, 0.5] },
        { "type": "player", "id": "defender", "role": "defender", "label": "Defender", "at": [1.45, 0.5] }
      ]
    },
    "goal": "Defender wins the ball, keeps it, and dribbles to the opposite end.",
    "steps": [
      "Set up a 1v1 in a small area (5 × 10 yards).",
      "Attacker dribbles and the defender tries to win the ball.",
      "When the defender wins it, they must keep possession and dribble to the end line.",
      "Switch roles and repeat (6–8 reps)."
    ],
    "equipment": ["4 cones", "One ball per pair"]
  }
}
$json$::jsonb)
on conflict (slug) do nothing;
