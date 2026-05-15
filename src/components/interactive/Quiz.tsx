import { useState, useCallback } from 'react';
import type { Quiz as QuizType, QuizQuestion } from '@/types/interactive';
import { verifyAnswer } from '@/utils/quiz';

interface QuizProps {
  quiz: QuizType;
}

interface AnswerFeedback {
  correct: boolean;
  correctAnswer?: string;
  explanation: string;
}

/**
 * Quiz component renders an expandable "Test Yourself" section
 * with multiple-choice and fill-in-the-blank questions.
 *
 * - Collapsed by default
 * - Shows progress (question X of Y)
 * - Displays feedback within 500ms of answer submission
 * - Correct: green feedback with explanation (≤150 chars)
 * - Incorrect: red feedback with correct answer + step-by-step explanation
 */
export function Quiz({ quiz }: QuizProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [feedback, setFeedback] = useState<AnswerFeedback | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [fillInAnswer, setFillInAnswer] = useState('');

  const currentQuestion: QuizQuestion | undefined = quiz.questions[currentIndex];
  const totalQuestions = quiz.questions.length;

  const handleAnswer = useCallback(
    (userAnswer: string) => {
      if (!currentQuestion) return;

      const result = verifyAnswer(userAnswer, currentQuestion.correctAnswer);

      setFeedback({
        correct: result.correct,
        correctAnswer: result.correctAnswer,
        explanation: currentQuestion.explanation,
      });
    },
    [currentQuestion]
  );

  const handleMultipleChoiceSelect = (option: string) => {
    if (feedback) return; // Prevent re-answering
    setSelectedOption(option);
    handleAnswer(option);
  };

  const handleFillInSubmit = () => {
    if (feedback || !fillInAnswer.trim()) return;
    handleAnswer(fillInAnswer);
  };

  const handleNext = () => {
    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex(currentIndex + 1);
      setFeedback(null);
      setSelectedOption(null);
      setFillInAnswer('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleFillInSubmit();
    }
  };

  if (totalQuestions === 0) return null;

  return (
    <section className="quiz" aria-labelledby={`quiz-heading-${quiz.id}`}>
      <button
        className="quiz__toggle"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        aria-controls={`quiz-content-${quiz.id}`}
      >
        <span className="quiz__toggle-icon" aria-hidden="true">
          {isExpanded ? '▼' : '▶'}
        </span>
        Test Yourself
      </button>

      {isExpanded && (
        <div
          className="quiz__content"
          id={`quiz-content-${quiz.id}`}
          role="region"
          aria-label="Quiz questions"
        >
          <div className="quiz__progress" aria-live="polite">
            Question {currentIndex + 1} of {totalQuestions}
          </div>

          {currentQuestion && (
            <div className="quiz__question">
              <p className="quiz__prompt" id={`quiz-heading-${quiz.id}`}>
                {currentQuestion.prompt}
              </p>

              {currentQuestion.type === 'multiple-choice' && (
                <MultipleChoiceOptions
                  options={currentQuestion.options ?? []}
                  selectedOption={selectedOption}
                  correctAnswer={currentQuestion.correctAnswer}
                  feedback={feedback}
                  onSelect={handleMultipleChoiceSelect}
                />
              )}

              {currentQuestion.type === 'fill-in-the-blank' && (
                <FillInTheBlank
                  value={fillInAnswer}
                  onChange={setFillInAnswer}
                  onSubmit={handleFillInSubmit}
                  onKeyDown={handleKeyDown}
                  disabled={feedback !== null}
                />
              )}

              {feedback && (
                <FeedbackDisplay feedback={feedback} />
              )}

              {feedback && currentIndex < totalQuestions - 1 && (
                <button
                  className="quiz__next-btn"
                  onClick={handleNext}
                  aria-label="Next question"
                >
                  Next
                </button>
              )}

              {feedback && currentIndex === totalQuestions - 1 && (
                <p className="quiz__complete" aria-live="polite">
                  Quiz complete!
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

interface MultipleChoiceOptionsProps {
  options: string[];
  selectedOption: string | null;
  correctAnswer: string;
  feedback: AnswerFeedback | null;
  onSelect: (option: string) => void;
}

function MultipleChoiceOptions({
  options,
  selectedOption,
  correctAnswer,
  feedback,
  onSelect,
}: MultipleChoiceOptionsProps) {
  return (
    <div className="quiz__options" role="group" aria-label="Answer options">
      {options.map((option) => {
        let className = 'quiz__option-btn';

        if (feedback) {
          if (option === correctAnswer) {
            className += ' quiz__option-btn--correct';
          } else if (option === selectedOption) {
            className += ' quiz__option-btn--incorrect';
          }
        } else if (option === selectedOption) {
          className += ' quiz__option-btn--selected';
        }

        return (
          <button
            key={option}
            className={className}
            onClick={() => onSelect(option)}
            disabled={feedback !== null}
            aria-pressed={option === selectedOption}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

interface FillInTheBlankProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  disabled: boolean;
}

function FillInTheBlank({
  value,
  onChange,
  onSubmit,
  onKeyDown,
  disabled,
}: FillInTheBlankProps) {
  return (
    <div className="quiz__fill-in">
      <input
        type="text"
        className="quiz__fill-in-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={disabled}
        placeholder="Type your answer..."
        aria-label="Your answer"
      />
      <button
        className="quiz__check-btn"
        onClick={onSubmit}
        disabled={disabled || !value.trim()}
      >
        Check
      </button>
    </div>
  );
}

interface FeedbackDisplayProps {
  feedback: AnswerFeedback;
}

function FeedbackDisplay({ feedback }: FeedbackDisplayProps) {
  if (feedback.correct) {
    return (
      <div className="quiz__feedback quiz__feedback--correct" role="alert" aria-live="assertive">
        <span className="quiz__feedback-icon" aria-hidden="true">✓</span>
        <span className="quiz__feedback-text">{feedback.explanation}</span>
      </div>
    );
  }

  return (
    <div className="quiz__feedback quiz__feedback--incorrect" role="alert" aria-live="assertive">
      <span className="quiz__feedback-icon" aria-hidden="true">✗</span>
      <div className="quiz__feedback-body">
        <p className="quiz__feedback-correct-answer">
          Correct answer: <strong>{feedback.correctAnswer}</strong>
        </p>
        <p className="quiz__feedback-text">{feedback.explanation}</p>
      </div>
    </div>
  );
}

export default Quiz;
