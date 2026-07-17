# Future: target indicators in fight mode

Once fight mode can be active without attacking anyone (practice fight),
add two visual mob indicators:

- **In-range, not-targeted mobs**: any mob within the player's attack range
  while in fight (including non-aggressive mobs the player hasn't engaged)
  pulses with a yellow glow. Glow color and pulse configurable via config
  (not hardcoded).
- **Targeted mobs**: mobs the player is currently attacking (has started
  typing against) get a red inverted triangle (▽) floating above them.

Rationale: future weapons (e.g. bow) will fire only at selected/targeted
enemies, so the player needs a clear visual of which mobs are in range vs
which are being targeted. This is the groundwork for that targeting UI.

Cross-reference: depends on the "fight mode works with no enemies" change
(practice fight + non-aggressive mobs) landing first.
