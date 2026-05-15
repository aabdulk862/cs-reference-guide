/**
 * Pure answer verification function for quiz questions.
 * Performs case-insensitive, trimmed comparison between user answer and correct answer.
 */
export function verifyAnswer(
  userAnswer: string,
  correctAnswer: string
): { correct: boolean; correctAnswer?: string } {
  const normalizedUser = userAnswer.trim().toLowerCase();
  const normalizedCorrect = correctAnswer.trim().toLowerCase();

  if (normalizedUser === normalizedCorrect) {
    return { correct: true };
  }

  return { correct: false, correctAnswer };
}
