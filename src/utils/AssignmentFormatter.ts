import type { Assignment } from '../types.js';

/**
 * Stateless helpers for transforming a flat list of `Assignment` objects into
 * the grouped shapes most often needed by callers (UI tables, exports, etc.).
 */
export class AssignmentFormatter {
  // Pure utility class — not instantiable.
  private constructor() { }

  /**
   * Group assignments by reviewer.
   *
   * @returns A record mapping `reviewerId` to the list of paper IDs assigned
   *          to that reviewer. Reviewers with no assignments are absent.
   */
  public static groupByReviewer(
    assignments: Assignment[],
  ): Record<string, string[]> {
    const grouped: Record<string, string[]> = {};
    for (const { reviewerId, paperId } of assignments) {
      if (grouped[reviewerId] === undefined) {
        grouped[reviewerId] = [];
      }
      grouped[reviewerId].push(paperId);
    }
    return grouped;
  }

  /**
   * Group assignments by paper.
   *
   * @returns A record mapping `paperId` to the list of reviewer IDs assigned
   *          to that paper. Papers with no assignments are absent.
   */
  public static groupByPaper(
    assignments: Assignment[],
  ): Record<string, string[]> {
    const grouped: Record<string, string[]> = {};
    for (const { reviewerId, paperId } of assignments) {
      if (grouped[paperId] === undefined) {
        grouped[paperId] = [];
      }
      grouped[paperId].push(reviewerId);
    }
    return grouped;
  }
}
