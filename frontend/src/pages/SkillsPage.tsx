import { AVAILABLE_SKILLS } from '../constants/skills';
import './SkillsPage.css';

export default function SkillsPage() {
  return (
    <div className="skills-page">
      <div className="skills-header">
        <h2 className="skills-title">AI Skills</h2>
        <p className="skills-desc">
          Shinro AI is loaded with these specialized ClickHouse skills. Activate them in chat by typing <code>/</code>.
        </p>
      </div>
      <div className="skills-list">
        {AVAILABLE_SKILLS.map((skill) => (
          <div key={skill.id} className="skill-card">
            <span className="skill-card-label">{skill.label}</span>
            <p className="skill-card-desc">{skill.description}</p>
            <code className="skill-card-id">/{skill.id}</code>
          </div>
        ))}
      </div>
      <p className="skills-coming-soon">Custom skills coming soon.</p>
    </div>
  );
}
