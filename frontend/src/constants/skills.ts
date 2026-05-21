/**
 * Available ClickHouse Agent Skills.
 * Each skill maps to an AGENTS.md file in backend/ai_controller/skills/.
 */

export interface AgentSkill {
  id: string;
  label: string;
  description: string;
  /** Relative path from the skills directory */
  file: string;
}

export const AVAILABLE_SKILLS: AgentSkill[] = [
  {
    id: 'clickhouse-best-practices',
    label: 'Best Practices',
    description: 'ClickHouse performance & design best practices',
    file: 'clickhouse-best-practices/AGENTS.md',
  },
  {
    id: 'clickhouse-architecture-advisor',
    label: 'Architecture Advisor',
    description: 'Schema design, engine selection & scaling patterns',
    file: 'clickhouse-architecture-advisor/AGENTS.md',
  },
  {
    id: 'chdb-sql',
    label: 'chDB SQL',
    description: 'chDB embedded SQL engine usage & syntax',
    file: 'chdb-sql/AGENTS.md',
  },
  {
    id: 'chdb-datastore',
    label: 'chDB Datastore',
    description: 'chDB persistent data store operations',
    file: 'chdb-datastore/AGENTS.md',
  },
  {
    id: 'clickhousectl-cloud-deploy',
    label: 'Cloud Deploy',
    description: 'ClickHouse Cloud provisioning & deployment',
    file: 'clickhousectl-cloud-deploy/AGENTS.md',
  },
  {
    id: 'clickhousectl-local-dev',
    label: 'Local Dev',
    description: 'Local ClickHouse development environment setup',
    file: 'clickhousectl-local-dev/AGENTS.md',
  },
];

export const SKILL_IDS = AVAILABLE_SKILLS.map((s) => s.id);
