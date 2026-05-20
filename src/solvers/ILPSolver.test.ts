/**
 * conflow-algorithms — ILPSolver unit tests
 * -----------------------------------------------------------------------------
 * Verifies that the ILP-based assignment solver:
 *
 *   1. Out-performs a naive greedy algorithm on a classic "greedy trap" case.
 *   2. Throws on globally-infeasible inputs (insufficient total capacity).
 *   3. Treats conflicts as an absolute firewall — never relaxes them to
 *      satisfy minReviews.
 *   4. Finds the exact global optimum on a large, deterministically-seeded
 *      stress problem.
 *
 * Place at: `src/solvers/ILPSolver.test.ts` (vitest co-located convention).
 * Compatible with both `vitest` and `jest` (the imported helpers exist in
 * both APIs); swap the import line if you prefer jest globals.
 */

import { describe, expect, it } from 'vitest';

import type { Bid, Conflict, Paper, Reviewer } from '../types.js';
import { ILPSolver } from './ILPSolver.js';

// =============================================================================
// Deterministic PRNG (Mulberry32) — keeps the stress test fully reproducible
// across CI runs regardless of the JS engine's Math.random implementation.
// =============================================================================

/**
 * Mulberry32 — a tiny, well-distributed 32-bit PRNG.
 * Returns a function that yields uniform floats in [0, 1).
 *
 * @see https://github.com/bryc/code/blob/master/jshash/PRNGs.md#mulberry32
 */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * Fisher-Yates shuffle using our deterministic PRNG.
 * Mutates the array in-place.
 */
function shuffleArray<T>(array: T[], rng: () => number): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}


// =============================================================================
// Test suite
// =============================================================================

describe('ILPSolver', () => {
  // ---------------------------------------------------------------------------
  // Test Case 1 — The Greedy Trap
  // ---------------------------------------------------------------------------
  describe('Test Case 1: The Greedy Trap (proving ILP superiority)', () => {
    it('finds the globally optimal pairing that a greedy algorithm misses', () => {
      const reviewers: Reviewer[] = [
        { id: 'R1', capacity: 1 },
        { id: 'R2', capacity: 1 },
      ];
      const papers: Paper[] = [
        { id: 'P1', minReviews: 1, maxReviews: 1 },
        { id: 'P2', minReviews: 1, maxReviews: 1 },
      ];
      const bids: Bid[] = [
        { reviewerId: 'R1', paperId: 'P1', score: 10 },
        { reviewerId: 'R1', paperId: 'P2', score: 9 },
        { reviewerId: 'R2', paperId: 'P1', score: 9 },
        { reviewerId: 'R2', paperId: 'P2', score: 0 },
      ];
      const conflicts: Conflict[] = [];

      const result = new ILPSolver().assign(reviewers, papers, bids, conflicts);

      // Greedy would pick R1->P1 (10), then R2->P2 (0) = 10.
      // Optimal:           R2->P1 (9)  and  R1->P2 (9) = 18.
      expect(result.metrics.totalAffinityScore).toBe(18);
      expect(result.metrics.unassignedPapers).toEqual([]);

      expect(result.assignments).toHaveLength(2);
      expect(result.assignments).toEqual(
        expect.arrayContaining<Bid | { reviewerId: string; paperId: string }>([
          { reviewerId: 'R1', paperId: 'P2' },
          { reviewerId: 'R2', paperId: 'P1' },
        ]),
      );

      // Sanity: every paper covered exactly once.
      const reviewsPerPaper = countBy(result.assignments, (a) => a.paperId);
      expect(reviewsPerPaper.get('P1')).toBe(1);
      expect(reviewsPerPaper.get('P2')).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Test Case 2 — Infeasibility due to insufficient capacity
  // ---------------------------------------------------------------------------
  describe('Test Case 2: Infeasibility — insufficient total capacity', () => {
    it('throws when Σ reviewer.capacity < Σ paper.minReviews', () => {
      // 2 reviewers × capacity 1 = 2 slots,
      // but 3 papers each demanding 1 review = 3 slots needed.
      const reviewers: Reviewer[] = [
        { id: 'R1', capacity: 1 },
        { id: 'R2', capacity: 1 },
      ];
      const papers: Paper[] = [
        { id: 'P1', minReviews: 1, maxReviews: 1 },
        { id: 'P2', minReviews: 1, maxReviews: 1 },
        { id: 'P3', minReviews: 1, maxReviews: 1 },
      ];
      const bids: Bid[] = [
        { reviewerId: 'R1', paperId: 'P1', score: 5 },
        { reviewerId: 'R1', paperId: 'P2', score: 5 },
        { reviewerId: 'R1', paperId: 'P3', score: 5 },
        { reviewerId: 'R2', paperId: 'P1', score: 5 },
        { reviewerId: 'R2', paperId: 'P2', score: 5 },
        { reviewerId: 'R2', paperId: 'P3', score: 5 },
      ];

      expect(() =>
        new ILPSolver().assign(reviewers, papers, bids, []),
      ).toThrow(/infeasible/i);
    });
  });

  // ---------------------------------------------------------------------------
  // Test Case 3 — Conflict-induced infeasibility (absolute firewall)
  // ---------------------------------------------------------------------------
  describe('Test Case 3: Absolute conflict firewall', () => {
    it('refuses a conflicted bid even if it is the only path to feasibility', () => {
      const reviewers: Reviewer[] = [
        { id: 'R1', capacity: 1 },
        { id: 'R2', capacity: 1 },
      ];
      const papers: Paper[] = [
        { id: 'P1', minReviews: 1, maxReviews: 1 },
        { id: 'P2', minReviews: 1, maxReviews: 1 },
      ];
      // R1 can only review P1; R2 can only review P2 — but R2↔P2 is a conflict.
      // Therefore P2 cannot be covered, making the instance infeasible.
      const bids: Bid[] = [
        { reviewerId: 'R1', paperId: 'P1', score: 10 },
        { reviewerId: 'R2', paperId: 'P2', score: 10 },
      ];
      const conflicts: Conflict[] = [
        { reviewerId: 'R2', paperId: 'P2' },
      ];

      expect(() =>
        new ILPSolver().assign(reviewers, papers, bids, conflicts),
      ).toThrow(/infeasible/i);
    });
  });

  // ---------------------------------------------------------------------------
  // Test Case 4 — Large-scale deterministic stress test
  // ---------------------------------------------------------------------------
  describe('Test Case 4: Large-scale deterministic stress test', () => {
    interface Scenario {
      reviewers: Reviewer[];
      papers: Paper[];
      bids: Bid[];
      conflicts: Conflict[];
    }

    /**
     * Construct a balanced assignment instance with a *known unique optimum*:
     *
     *   - PAPER_COUNT       = 50 papers, each with minReviews = maxReviews = 3
     *   - REVIEWER_COUNT    = 150 reviewers (= 50 × 3), each with capacity 1
     *   - For paper Pᵢ, reviewers R(3i), R(3i+1), R(3i+2) are "dedicated"
     *     and bid SIGNAL_SCORE (100) on Pᵢ.
     *   - Every reviewer additionally bids NOISE_SCORE (1) on
     *     NOISE_BIDS_PER_REVIEWER (5) other distinct papers.
     *
     * Because total reviewer capacity (150) exactly equals total demand
     * (50 × 3 = 150), every reviewer MUST be used in any feasible solution.
     * Re-routing any reviewer away from their dedicated paper costs −100 + 1
     * and forces a cascading −99 swap somewhere else, so the *unique* optimum
     * is to use only signal bids:
     *
     *     OPTIMAL_SCORE = PAPER_COUNT × REVIEWS_PER_PAPER × SIGNAL_SCORE
     *                   = 50 × 3 × 100 = 15,000
     */
    function buildStressScenario(): Scenario {
      const PAPER_COUNT = 50;
      const REVIEWS_PER_PAPER = 3;
      const REVIEWER_COUNT = PAPER_COUNT * REVIEWS_PER_PAPER; // 150
      const NOISE_BIDS_PER_REVIEWER = 5;
      const NOISE_SCORE = 99.9999;
      const SIGNAL_SCORE = 100;

      const papers: Paper[] = Array.from({ length: PAPER_COUNT }, (_, i) => ({
        id: `P${i}`,
        minReviews: REVIEWS_PER_PAPER,
        maxReviews: REVIEWS_PER_PAPER,
      }));

      const reviewers: Reviewer[] = Array.from(
        { length: REVIEWER_COUNT },
        (_, i) => ({ id: `R${i}`, capacity: 1 }),
      );

      const bids: Bid[] = [];
      const rng = makeRng(0xc0_ff_ee);

      for (let i = 0; i < REVIEWER_COUNT; i++) {
        const dedicatedPaperIdx = Math.floor(i / REVIEWS_PER_PAPER);

        // (a) Signal bid on the reviewer's dedicated paper.
        bids.push({
          reviewerId: `R${i}`,
          paperId: `P${dedicatedPaperIdx}`,
          score: SIGNAL_SCORE,
        });

        // (b) Five distinct noise bids on OTHER papers, deterministically drawn.
        const chosen = new Set<number>([dedicatedPaperIdx]);
        while (chosen.size < 1 + NOISE_BIDS_PER_REVIEWER) {
          const candidate = Math.floor(rng() * PAPER_COUNT);
          if (chosen.has(candidate)) continue;
          chosen.add(candidate);
          bids.push({
            reviewerId: `R${i}`,
            paperId: `P${candidate}`,
            score: NOISE_SCORE,
          });
        }
      }

      // Shuffle the bids so the optimal path isn't sequentially predictable
      shuffleArray(bids, rng);

      return { reviewers, papers, bids, conflicts: [] };
    }

    it(
      'achieves the exact optimal score of 15,000 and assigns every paper',
      () => {
        const { reviewers, papers, bids, conflicts } = buildStressScenario();

        const result = new ILPSolver().assign(
          reviewers,
          papers,
          bids,
          conflicts,
        );

        // (1) Score: must hit the ceiling exactly.
        expect(result.metrics.totalAffinityScore).toBe(15_000);

        // (2) Coverage: every paper covered to its minReviews.
        expect(result.metrics.unassignedPapers).toEqual([]);

        // (3) Cardinality: exactly 150 assignments (capacity-saturated).
        expect(result.assignments).toHaveLength(150);

        // (4) Each paper receives exactly 3 reviewers.
        const reviewsPerPaper = countBy(result.assignments, (a) => a.paperId);
        for (const p of papers) {
          expect(reviewsPerPaper.get(p.id)).toBe(3);
        }

        // (5) Each reviewer assigned at most once (capacity = 1).
        const papersPerReviewer = countBy(
          result.assignments,
          (a) => a.reviewerId,
        );
        for (const r of reviewers) {
          expect(papersPerReviewer.get(r.id) ?? 0).toBeLessThanOrEqual(1);
        }

        // (6) Every assignment is a "signal" bid (score 100) — proves the
        //     solver bypassed all noise. If any noise bid were chosen, the
        //     total score would be < 15,000 and assertion (1) would fail.
      },
      30_000, // ILP branch-and-bound can be slow; give it plenty of room.
    );
  });
});

// =============================================================================
// Local test helpers
// =============================================================================

/**
 * Count occurrences in `items` grouped by the value returned by `keyOf`.
 * A small replacement for lodash's `_.countBy` that keeps the test file
 * dependency-free.
 */
function countBy<T>(items: readonly T[], keyOf: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyOf(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}
