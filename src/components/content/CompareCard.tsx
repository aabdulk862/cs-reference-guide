import { CompareOption } from '../../types/content';

export interface CompareCardProps {
  title: string;
  options: CompareOption[];
}

/**
 * CompareCard renders a side-by-side comparison layout for technology
 * or pattern comparisons with pros/cons visual accents.
 *
 * Validates: Requirements 7.2, 7.3, 7.5, 7.6
 */
export function CompareCard({ title, options }: CompareCardProps) {
  return (
    <div className="compare-card" role="region" aria-label={`Comparison: ${title}`}>
      <h3 className="compare-card__title">{title}</h3>
      <div className="compare-card__grid">
        {options.map((option) => (
          <div key={option.name} className="compare-card__option">
            <div className="compare-card__option-header">{option.name}</div>
            {option.body && (
              <p className="compare-card__option-body">{option.body}</p>
            )}
            {option.pros && option.pros.length > 0 && (
              <div className="compare-card__pros">
                <span className="compare-card__list-label">Pros</span>
                <ul className="compare-card__list">
                  {option.pros.map((pro, index) => (
                    <li key={index} className="compare-card__list-item compare-card__list-item--pro">
                      {pro}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {option.cons && option.cons.length > 0 && (
              <div className="compare-card__cons">
                <span className="compare-card__list-label">Cons</span>
                <ul className="compare-card__list">
                  {option.cons.map((con, index) => (
                    <li key={index} className="compare-card__list-item compare-card__list-item--con">
                      {con}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default CompareCard;
