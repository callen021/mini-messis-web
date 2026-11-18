-- At-home drills (D127): ten soccer drills for parents and children, from the reviewed
-- home-drills sheet, word for word. They are library items of a new category, `home`, with one
-- content section, `home`: the drill's skill and type (repetition, timed or accuracy), its
-- minutes, the "With a parent" and "On my own" versions, three levels (suggestions, none locked),
-- coaching tips, any extra note the sheet gives, and the demo clip description. There are no
-- videos yet: `clip` is stored and nothing shows it. Inserted published, since parents cannot
-- see drafts (D125). The existing items are not touched.

alter table public.library_items drop constraint library_items_category_check;
alter table public.library_items add constraint library_items_category_check
  check (category in ('fundamentals', 'tactics', 'position', 'home'));

insert into public.library_items (slug, sport, category, title, age_min, age_max, sort_order, is_published, content)
values
('toe-taps', 'soccer', 'home', 'Toe Taps', 6, 10, 10, true, $json$
{
  "home": {
    "skill": "Footwork",
    "type": "repetition",
    "type_label": "Repetition",
    "minutes": 3,
    "intro": "The ball stays still. The child taps the top of it with the sole of one foot, then the other, with a light bounce between taps.",
    "with_parent": "Take turns. Count each other's taps out loud and see who reaches the target without the ball rolling away.",
    "on_my_own": "Count your own taps. If the ball rolls away, start again from zero.",
    "levels": [
      {
        "text": "20 controlled taps."
      },
      {
        "text": "40 controlled taps."
      },
      {
        "text": "30 taps while moving in a circle around the ball."
      }
    ],
    "tips": "Stay on the balls of your feet. Touch the ball lightly and don't stand on it. Arms out for balance. Look up when you can.",
    "clip": "Side view. Four slow taps, then the same rhythm faster."
  }
}
$json$::jsonb),
('inside-inside-touches', 'soccer', 'home', 'Inside-Inside Touches (TikToks)', 6, 10, 20, true, $json$
{
  "home": {
    "skill": "Footwork",
    "type": "repetition",
    "type_label": "Repetition",
    "minutes": 3,
    "intro": "The child knocks the ball side to side between the insides of both feet, with a small hop on each touch.",
    "with_parent": "Count together. The parent calls \"freeze\" at random and the child stops the ball with the sole.",
    "on_my_own": "Count touches until the ball gets away from you, then try to beat that number.",
    "levels": [
      {
        "text": "20 touches standing in place."
      },
      {
        "text": "40 touches with knees bent, looking up every few touches."
      },
      {
        "text": "Touches while moving forward 10 yards and back."
      }
    ],
    "tips": "Bend your knees. Keep the ball under your body. Soft touches, small hops.",
    "clip": "Front view. Slow touches in place, then moving forward."
  }
}
$json$::jsonb),
('sole-rolls', 'soccer', 'home', 'Sole Rolls', 6, 10, 30, true, $json$
{
  "home": {
    "skill": "Footwork",
    "type": "repetition",
    "type_label": "Repetition",
    "minutes": 3,
    "intro": "The child rolls the sole of one foot across the top of the ball to move it sideways, then rolls it back with the other foot.",
    "with_parent": "Mirror game. The parent steps left or right and the child follows by rolling the ball the same way.",
    "on_my_own": "Roll the ball along a line, such as a driveway crack, for 5 yards and back.",
    "levels": [
      {
        "text": "10 rolls with each foot, standing in place."
      },
      {
        "text": "20 rolls across and back without stopping."
      },
      {
        "text": "Roll sideways along a 5-yard line and back, using both feet."
      }
    ],
    "tips": "Use the bottom of your foot. Keep the ball close. Hop on your standing foot. Don't lean back.",
    "clip": "Front view. One roll right, one roll left, then continuous."
  }
}
$json$::jsonb),
('v-cuts', 'soccer', 'home', 'V-Cuts', 6, 10, 40, true, $json$
{
  "home": {
    "skill": "Dribbling move",
    "type": "repetition",
    "type_label": "Repetition",
    "minutes": 4,
    "intro": "The child pushes the ball forward at an angle, pulls it back with the sole, then pushes it out the other way with the inside of the same foot. The ball's path makes a V.",
    "with_parent": "The parent stands one step away as a defender who doesn't tackle. The child does the V away from them. The parent can point which way to go.",
    "on_my_own": "Use a cone as the defender.",
    "levels": [
      {
        "text": "5 slow V-cuts with each foot."
      },
      {
        "text": "10 with each foot without stopping between them."
      },
      {
        "text": "V-cut, then speed up for 3 yards past a cone. Both feet."
      }
    ],
    "tips": "Pull back with the sole. Push out with the inside of your foot. Turn your hips. Go fast after the move, not during it.",
    "clip": "Overhead or front view with a cone. One slow V-cut, then one at speed."
  }
}
$json$::jsonb),
('l-drags', 'soccer', 'home', 'L-Drags', 6, 10, 50, true, $json$
{
  "home": {
    "skill": "Dribbling move",
    "type": "repetition",
    "type_label": "Repetition",
    "minutes": 4,
    "intro": "The child pulls the ball back with the sole, then taps it behind the standing leg with the inside of the same foot, turns and goes. The ball's path makes an L.",
    "with_parent": "The parent stands in front as a defender who doesn't tackle. The child L-drags to the side and dribbles away.",
    "on_my_own": "Dribble at a cone and do the move just before reaching it.",
    "levels": [
      {
        "text": "5 slow L-drags with each foot."
      },
      {
        "text": "10 with each foot without stopping between them."
      },
      {
        "text": "Dribble at a cone, L-drag, then speed up for 3 yards."
      }
    ],
    "tips": "Sole on top of the ball. Pull back first, then tap behind your standing leg. Keep the standing leg bent. Look up after the turn.",
    "clip": "Front view with a cone. One slow L-drag showing the two touches, then one at speed."
  }
}
$json$::jsonb),
('cone-dribbling', 'soccer', 'home', 'Cone Dribbling', 6, 10, 60, true, $json$
{
  "home": {
    "skill": "Dribbling",
    "type": "timed",
    "type_label": "Timed",
    "minutes": 4,
    "intro": "The child weaves the ball through a line of cones and back. This is the drill with the built-in stopwatch and personal best. The course is fixed for each level, so times at the same level are always comparable.",
    "with_parent": "The parent runs the stopwatch. Then swap, so the child times the parent on the same course.",
    "on_my_own": "No stopwatch. Count clean runs in a row instead, and try for three.",
    "levels": [
      {
        "text": "5 cones in a straight line, 3 yards apart, down and back."
      },
      {
        "text": "5 cones, 2 yards apart, down and back."
      },
      {
        "text": "The Level 1 course using only the weaker foot."
      }
    ],
    "notes": [
      {
        "title": "What counts as a clean run",
        "text": "No cone knocked over, and the ball stays within about one step the whole way."
      }
    ],
    "tips": "Small touches. Use the inside and the outside of your foot. Look up between cones. Control first, speed second.",
    "clip": "Overhead view. One clean run, then one where the ball gets away, marked as not counting.",
    "stopwatch": true
  }
}
$json$::jsonb),
('inside-outside-touches', 'soccer', 'home', 'Inside-Outside Touches', 6, 10, 70, true, $json$
{
  "home": {
    "skill": "Dribbling",
    "type": "repetition",
    "type_label": "Repetition",
    "minutes": 3,
    "intro": "Using one foot, the child touches the ball with the inside, then the outside, so it zigzags as they move forward.",
    "with_parent": "The parent walks backward in front and holds up fingers. The child calls the number while dribbling, which keeps their head up.",
    "on_my_own": "Go 10 yards with one foot and come back with the other.",
    "levels": [
      {
        "text": "10 touches with each foot at walking pace."
      },
      {
        "text": "10 yards out with one foot and back with the other, without stopping."
      },
      {
        "text": "The same at a jog, looking up every few touches."
      }
    ],
    "tips": "Toe down for the outside touch. Keep the ball within one step. Bend your knees.",
    "clip": "Front view. Slow inside-outside with one foot, then moving forward."
  }
}
$json$::jsonb),
('wall-passing-and-first-touch', 'soccer', 'home', 'Wall Passing and First Touch', 6, 10, 80, true, $json$
{
  "home": {
    "skill": "Passing",
    "type": "repetition",
    "type_label": "Repetition",
    "minutes": 5,
    "intro": "The child passes the ball against a wall from 3 to 5 yards away, controls the rebound, and passes again. This is the main drill a child can do alone, and it practices the First Touch skill from the library.",
    "with_parent": "The parent stands to the side and calls \"left\" or \"right\" for which foot to use next.",
    "on_my_own": "Count passes in a row without losing control.",
    "levels": [
      {
        "text": "10 passes using two touches: stop it, then pass it."
      },
      {
        "text": "20 passes using two touches, switching feet each time."
      },
      {
        "text": "10 passes where the first touch moves the ball to the side before the pass. Do both sides."
      }
    ],
    "notes": [
      {
        "title": "No wall",
        "text": "Use drill 10 instead. Pick a wall away from windows and cars."
      }
    ],
    "tips": "Use the inside of your foot. Lock your ankle. Point your standing foot at the target. Cushion the ball on the first touch.",
    "clip": "Side view. Pass, cushion, pass. Then one with the first touch to the side."
  }
}
$json$::jsonb),
('juggling', 'soccer', 'home', 'Juggling', 6, 10, 90, true, $json$
{
  "home": {
    "skill": "Ball control",
    "type": "repetition",
    "type_label": "Repetition",
    "minutes": 3,
    "intro": "The child keeps the ball in the air with their feet or thighs. Younger players start by dropping the ball from their hands and catching it again.",
    "with_parent": "The parent tosses the ball gently underhand. The child touches it back to the parent's hands with a foot or thigh.",
    "on_my_own": "Drop, touch, catch. Count how many you complete.",
    "levels": [
      {
        "text": "Drop, one touch, catch. Do it 10 times."
      },
      {
        "text": "Drop, two touches, catch. Do it 5 times."
      },
      {
        "text": "Most touches in a row without catching. One bounce between touches is allowed."
      }
    ],
    "tips": "Small kicks, no higher than your waist. Lock your ankle. Keep your eyes on the ball.",
    "clip": "Front view. Drop, one touch, catch. Then three touches in a row."
  }
}
$json$::jsonb),
('first-touch-and-passing-with-a-parent', 'soccer', 'home', 'First Touch and Passing With a Parent', 6, 10, 100, true, $json$
{
  "home": {
    "skill": "Passing",
    "type": "repetition",
    "type_label": "Repetition, then accuracy",
    "minutes": 5,
    "intro": "Parent and child stand 5 yards apart and pass back and forth. The child controls each pass before returning it. Level 3 is the accuracy challenge for the first version.",
    "with_parent": "Pass back and forth and count out loud together.",
    "on_my_own": "Use drill 8 against a wall.",
    "levels": [
      {
        "text": "10 passes using two touches."
      },
      {
        "text": "20 passes, switching feet each time."
      },
      {
        "text": "Pass through a gate of two cones set 2 yards apart. Score 8 out of 10.",
        "type": "accuracy"
      }
    ],
    "tips": "Move your feet to get behind the ball. Cushion it. First touch away from pressure. Pass with the inside of your foot.",
    "clip": "Side view of both players. Two passes with control, then one through the cone gate."
  }
}
$json$::jsonb)
on conflict (slug) do nothing;
