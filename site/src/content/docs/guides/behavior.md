---
title: Design behavior with the manifest
description: What we learned tuning Lango's bees, and how to describe entity types, fields and rules so the model behaves as intended. Numbers and words both work if done right.
---

In A2G the game reports what is true and the [manifest](/glossary/#manifest) says how entities should behave. This page collects what we measured while tuning the bees of the [Lango example](/examples/lango/), and turns it into recommendations. The numbers come from the reference service with `gpt-6-luna`; other models will differ in detail, but the patterns are general.

:::tip[How we measured]
Each [decision](/glossary/#decision) carries the model's probability for every offered action. We fixed a set of situations, wrote down the action a designer expects, and compared variants by the probability of that action, three repeats each, then confirmed the winners in the running game. See [Test with a scenario set](#test-with-a-scenario-set).
:::

## 1. The game reports the truth; the manifest shapes behavior

The [adapter](/glossary/#adapter) should report what the game itself knows, with the game's own rules. When Lango's bees seemed "blind" after being knocked back, we widened their perception of the player in the adapter. The result: bees "saw" the player through a house wall and rushed the door. The fix was to restore the game's native detection zone and keep perception honest.

- **Perception, rules and legal actions belong to the game.** If an entity cannot see the player in the original game, the adapter does not report it and [legal actions](/glossary/#legal-actions) do not include chasing.
- **Behavior belongs to the manifest.** If enemies should be braver, more cautious or more cooperative, change the descriptions, not the game's facts.
- **Changing what an entity can perceive is a game design decision,** for example a larger detection zone, and should be made in the game, not hidden in the adapter.

## 2. Write the default first, then the exceptions

A description that only lists special cases leaves the common case to chance. Our group-aware bee description covered swarms, a weakened player and wounded loners, but said nothing about a **healthy bee alone**. Such bees hovered with `wander` at confidence 0.2 to 0.44, although the original game's bees always chase a visible player.

After the description started with the default ("a bee that is healthy and knows where the player is attacks, even alone"), the same situation gave `chase` in 3 of 3 runs (0.8 to 0.95).

**Recommendation:** start with what the type does most of the time, then list exceptions. Low confidence on an everyday situation usually means the description does not cover it.

## 3. Keep rules few and simple

Models follow a few clear rules reliably. Chains of conditions with numeric thresholds ("if A, unless B, when C is at least 2") are followed unreliably: the same input could flip between `chase` and `flee` with confidence around 0.1.

| What worked reliably | What did not |
| --- | --- |
| Healthy swarm attacks | "A bee at 0.333 attacks only if two or more allies fight the player" |
| Last badly wounded bee flees | The same rule with one ally (should flee, often chased) |
| A healthy bee attacks, even alone | Three-way rules mixing player health, own health and ally counts |
| Everyone attacks a nearly dead player | |

**Recommendations:**

- Prefer 2 to 4 short rules, ordered, "first match wins".
- Name the field each rule uses (`allies_near_player`), so the rule maps to data.
- If a rule needs arithmetic, let the game compute the value (see [section 5](#5-give-signals-relative-to-what-matters)).
- Stay well inside the limit of 1000 characters per description: long rule lists do not help.

## 4. Numbers or words: both work, if done right

We compared two encodings of the same seven situations: numeric observations (`hp_fraction: 0.333`, `allies_near_player: 2`) with numeric rules, and labels (`health: one_hit_left`, `bees_fighting_player: two_or_more`, `player_condition: healthy`) with worded rules.

| Situation | Expected | Numbers | Labels |
| --- | --- | --- | --- |
| Healthy, 5 allies | chase | chase 0.96 | chase 0.96 |
| Healthy, alone | chase | chase 0.97 | chase 0.83 |
| One hit left, 2 allies, healthy player | chase | chase 0.60 | chase 0.55 |
| One hit left, 1 ally, healthy player | flee | **chase** (0.32) | flee 0.46 |
| Wounded, 1 ally, healthy player | chase | chase 0.90 | **wander** (0.19) |
| One hit left, alone | flee | flee 0.77 | flee 0.68 |
| One hit left, player nearly dead | chase | chase 0.97 | chase 0.98 |
| **Mean probability of the expected action** | | **0.78** | **0.66** |

Neither encoding won: each failed a different intermediate rule, and both handled the defaults well. The sample was small, so the gap in the mean is not a verdict. What matters more is how either is written.

**If you use numbers:**

- Normalize (`hp_fraction` 0..1, not raw HP) and state the scale and units in `world` or the description ("one hit removes a third").
- Say what the values mean in play: "0.333 is one hit from death".
- Keep thresholds in rules few and round.

**If you use words (enums):**

- Make each label self-explanatory: `one_hit_left` beats `low`.
- Keep the label set small and ordered, and use the same words in the rules.
- Remember that enum values are also typed: the service rejects anything outside the list, which catches adapter bugs.

**Either way:** test on a scenario set instead of trusting a rule of thumb. A hybrid (the number plus a label) is easy to try.

## 5. Give signals relative to what matters

Lango first reported `allies_near`: other bees within 120 px of this bee. Two wounded bees flanking the player on opposite sides were 190 px apart, so each saw zero allies and fled. Tactically they were a pincer. Adding `allies_near_player` (other bees within 140 px of the player) fixed it: in the same situation with a weakened player, both bees attacked in 3 of 3 runs.

**Recommendation:** measure relations against the goal of the decision (the target, the objective, the leader), not only against the entity itself. The service's [situation context](/specification/decide/#what-the-provider-sees) (`nearby`, `population`, `observed_entities`) helps, but a field computed by the game for the rule you write is clearer.

## 6. Memory and context steer decisions

The model weighs everything it receives:

- **[Memory](/glossary/#memory) outcomes.** "While chasing, my HP dropped by 0.667" pushed wounded bees to flee even where a rule said attack. This is often desirable (entities learn from what just happened), but it can override rules.
- **Population.** "1 of 6 bees left" made a healthy bee cautious although no rule mentioned it.
- **Its own previous action.** A `current_action` of `wander` with harmless outcomes made the model keep wandering.

**Recommendations:** say explicitly what should and should not count ("only bees near the player count; earlier decisions do not bind"), and keep rules consistent with what memory will teach. When a decision surprises you, look at the full input in the console before changing the description.

## 7. Where the description goes

The reference service puts each type's `description` into the question for that entity, not only into the data. Measured on the same situation (three wounded bees next to the player), a group-aware description made the bees attack with probability 0.72 when placed in the question and 0.21 when sent only as data. Manifest texts are written by the studio and are trusted; runtime values always stay data ([prompt injection](/specification/security/#prompt-injection)).

## 8. Use events for changes that should prompt a new decision

A timer alone means an entity may keep an outdated decision for seconds. Lango declares [events](/glossary/#event) for the moments that change the right answer: `hit`, `player_spotted`, `player_lost`, and `allies_gathered` (allies arrive, so a wounded bee may rejoin the fight).

## 9. Cache only what is truly equivalent

The [decision cache](/glossary/#decision-cache) reuses one answer for every situation with the same key. Two mistakes we made:

- **The key missed a deciding value.** Without `distance_to_player` in the key, a `wander` decided next to the player was reused while the bee moved away and back, and the bee stood still for up to the cache TTL. Put every value your rules depend on into the key, bucketed.
- **Uncertain answers were cached.** A `wander` at confidence 0.12 is a coin flip; caching it froze the flip for every similar bee. The reference service does not cache decisions below confidence 0.5.

Cached decisions ignore memory and nearby entities by design. Cache types that are many and alike; keep important characters individual.

## 10. Watch confidence

Confidence is the quickest signal of a description problem. In Lango, situations covered by a clear rule reached 0.8 to 1.0; uncovered or conflicting ones stayed below 0.4. The [Agent2Game Console](/implementations/service/) shows confidence per decision and per memory entry.

## Test with a scenario set

Treat the manifest like code and test it:

1. **Collect situations** from real sessions (the Agent2Game Console's request logs contain every observation) and add the rare ones a designer cares about.
2. **Write the expected action** for each.
3. **Run every manifest change** against the set and record the probability of the expected action, a few repeats each.
4. **Confirm the winners in the game**, because physics, timing and events add effects a static set does not have. In Lango a test that teleported bees on top of each other let the physics engine scatter them before the question, which looked like a model failure.

A scenario set of 30 to 50 situations settles questions like "numbers or words" in minutes, for cents.

## Checklist

- [ ] The adapter reports the game's own perception and rules.
- [ ] The description starts with the default behavior, then 2 to 4 ordered exceptions.
- [ ] Every rule names the field it uses; values are normalized or clearly labeled.
- [ ] Fields measure what the rules need (relative to the target where it matters).
- [ ] The description says what to ignore (other areas, old decisions) if that matters.
- [ ] Events exist for changes that should prompt a new decision.
- [ ] Cache keys contain every value the rules use.
- [ ] A scenario set with expected actions passes before you ship the change.
