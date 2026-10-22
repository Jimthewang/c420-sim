# NPR archipelago, free camera, and collision overhaul

Approved scope: the user's five-module October 15 brief. Original getTelemetry, aerodynamic/hydrodynamic formulas, wind shadows, race/course rules, penalties, and lessons remain in place. No general-purpose physics engine or additional runtime dependency.

1. Shared world and collisions: four-octave seeded height field, protected race corridor, hull/foil grounding, swept solid contacts, iterative separation, collision-aware AI recovery. Verify clearance, sliding, high-speed contacts, rule regressions, and complete fleet races.
2. Toy models and water: curved hull/foils/committee; toon gradients and smooth-normal outline shells; flat 3D terrain and waves; shoreline/bow/stern/maneuver foam; crew boom ducking. Verify geometry, pose clearances, shared samples, and forbidden legacy materials/geometry.
3. Navigation and interface: free orbit/pan/4–180m zoom, three camera presets, water/terrain clearance, smooth recenter, Neo-Brutalism HUD, outline/seed/daylight controls. Verify camera interactions, keyboard gameplay, responsive layout, and visible behavior in a real browser.
4. Integration and handoff: run all tests and production build, independently review interactions, update controls/progress docs and existing PR #1, verify remote checks. Keep main and deployment unchanged pending merge.

Wave heights alter render buoyancy, not sail-force equations. A capsized boat may put its rig and deck into the sea intentionally; solid terrain, hulls, and buoys still resolve contacts. Racing penalties remain the game's simplified sailed 360° procedure.
