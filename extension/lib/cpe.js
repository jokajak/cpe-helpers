// CPE credit math, ported from the Rust `calculate_cpe_credits`
// (crates/sn-summarize/src/main.rs): credits = floor(duration_min / speed / 60).
//
// Verified against the Rust unit tests:
//   creditsFor(120, 1.25) === 1   (96 actual minutes)
//   creditsFor(75, 1.25)  === 1   (60 actual minutes)
//   creditsFor(74, 1.25)  === 0   (59.2 actual minutes)
//   creditsFor(150, 1.25) === 2   (120 actual minutes)

export function actualListeningMinutes(durationMinutes, speed) {
  if (!(speed > 0)) return durationMinutes;
  return durationMinutes / speed;
}

export function creditsFor(durationMinutes, speed) {
  if (!(durationMinutes > 0) || !(speed > 0)) return 0;
  return Math.floor(actualListeningMinutes(durationMinutes, speed) / 60);
}
