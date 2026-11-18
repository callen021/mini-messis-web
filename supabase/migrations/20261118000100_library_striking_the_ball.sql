-- Practice library item: Striking the Ball (soccer, Fundamentals), from the seven-step "Shoot with
-- Power & Accuracy!" sheet (D126). Inserted unpublished. The teaching text is the sheet's own; the
-- wrong-vs-right pairs were drafted from it and approved by the user. The sheet has no cone setup,
-- so the setup section has no diagram and no numbers except the (empty) duration.

insert into public.library_items (slug, sport, category, title, age_min, age_max, sort_order, is_published, content)
values ('striking-the-ball', 'soccer', 'fundamentals', 'Striking the Ball', 6, 10, 30, false, $json$
{
  "learn": {
    "tagline": "Shoot with Power & Accuracy!",
    "focus": "Use the right technique to hit the ball clean, with power and control, toward your target.",
    "steps": [
      {
        "title": "Approach",
        "text": "Approach at a slight angle with controlled speed (2–4 steps).",
        "image": { "path": "striking-the-ball/step-1.webp", "width": 196, "height": 274 }
      },
      {
        "title": "Plant",
        "text": "Plant your non-kicking foot beside the ball, pointing toward your target (about 6–8 inches).",
        "image": { "path": "striking-the-ball/step-2.webp", "width": 198, "height": 274 }
      },
      {
        "title": "Load",
        "text": "Swing your kicking leg back and open your hips.",
        "image": { "path": "striking-the-ball/step-3.webp", "width": 192, "height": 274 }
      },
      {
        "title": "Rotate",
        "text": "Rotate your hips and bring your kicking leg forward with power.",
        "image": { "path": "striking-the-ball/step-4.webp", "width": 184, "height": 274 }
      },
      {
        "title": "Strike",
        "text": "Hit the center of the ball with your laces. Keep your ankle firm and your chest slightly over the ball.",
        "image": { "path": "striking-the-ball/step-5.webp", "width": 184, "height": 274 }
      },
      {
        "title": "Drive Through",
        "text": "Follow through with your kicking leg, letting your momentum carry you forward (the plant foot may lift).",
        "image": { "path": "striking-the-ball/step-6.webp", "width": 194, "height": 274 }
      },
      {
        "title": "Land",
        "text": "Land balanced and watch the ball go toward your target.",
        "image": { "path": "striking-the-ball/step-7.webp", "width": 178, "height": 274 }
      }
    ],
    "cues": [
      "Approach at a slight angle.",
      "Plant your non-kicking foot beside the ball, toward your target.",
      "Strike the middle of the ball with your laces.",
      "Drive through the ball with a full follow-through.",
      "Stay balanced and keep moving."
    ],
    "tips": [
      { "title": "Plant Foot", "text": "Beside the Ball", "image": { "path": "striking-the-ball/tip-1.webp", "width": 130, "height": 190 } },
      { "title": "Contact", "text": "With Your Laces", "image": { "path": "striking-the-ball/tip-2.webp", "width": 146, "height": 190 } },
      { "title": "Follow-Through", "text": "Drive Forward", "image": { "path": "striking-the-ball/tip-3.webp", "width": 124, "height": 190 } }
    ],
    "compare": [
      { "wrong": "Running straight at the ball.", "right": "Approach at a slight angle." },
      { "wrong": "Plant foot behind the ball.", "right": "Plant foot beside the ball, pointing toward your target." },
      { "wrong": "Kicking with your toe.", "right": "Hit the center of the ball with your laces." },
      { "wrong": "Leaning back.", "right": "Chest slightly over the ball." },
      { "wrong": "Stopping your leg at the ball.", "right": "Drive through with a full follow-through." }
    ],
    "big_picture": "A great shot comes from:",
    "big_picture_points": ["A good approach.", "A strong plant.", "Clean contact.", "A powerful follow-through."],
    "big_picture_close": "Put it all together to shoot with confidence!"
  },
  "setup": {
    "params": [
      { "key": "duration", "label": "Duration", "type": "duration", "default": null, "min": 5, "max": 30, "step": 5, "adjustable": true }
    ],
    "steps": [
      "Set up a goal or target (cones, net, or a wall).",
      "Take 3–5 shots focusing on technique (not just power).",
      "Then take 5 shots with more power.",
      "Track how many hit your target and try to improve."
    ],
    "equipment": ["Balls", "A goal or target (cones, net, or a wall)"]
  }
}
$json$::jsonb)
on conflict (slug) do nothing;
