# Libiamo Database Schema (Drizzle Pseudocode)

## Enums

userRole = enum('learner', 'admin')
languageCode = enum('en', 'es', 'fr')
taskType = enum('chat', 'oneshot', 'slow', 'translate')
uiVariant = enum('reddit', 'apple_mail', 'discord', 'imessage', 'ao3', 'translator')
taskDuration = enum('weekly', 'daily')
scheduleOrigin = enum('manual', 'auto')
sessionStatus = enum('in_progress', 'completed', 'evaluated', 'abandoned')  -- Phase A2
messageRole = enum('user', 'agent', 'tutor', 'hint')                        -- Phase A2


## Tables

### user (extends better-auth schema)

Existing better-auth fields: id, name, email, emailVerified, image, createdAt, updatedAt

Additional business fields:
  role             userRole      default 'learner'
  timezone         text          default 'UTC'
  nativeLanguage   text          -- BCP 47 format (e.g. 'zh-CN', 'ja')
  gemsBalance      integer       default 0
  activeLanguage   languageCode  not null
  deletedAt        timestamp     nullable


### userLearningProfile

  userId           text          FK -> user.id, onDelete cascade
  language         languageCode
  levelSelfAssign  integer       default 2, check 1-3
  createdAt        timestamp     default now
  updatedAt        timestamp     default now, onUpdate now

  PK: (userId, language)


### template

  id                serial        PK
  isActive          boolean       default true
  language          languageCode  not null
  type              taskType      not null
  ui                uiVariant     not null
  duration          taskDuration  not null

  titleBase         text          -- supports {{slot}} placeholders
  descriptionBase   text          -- HTML with placeholders
  objectivesBase    jsonb         -- [{order, text}]
  agentPromptBase   text          -- system prompt template
  agentPersonaPool  jsonb         -- [{name, age, personality, background}]
  backgroundHtml    text          -- learning material, no slots
  candidates        jsonb         -- [{slots: {}, context: {}}]

  maxTurns          integer       -- 0 for oneshot/translate
  estimatedWords    integer
  difficulty        integer       check 1-3
  pointReward       integer       -- default: weekly=3pt, daily=1pt
  gemReward         integer       -- default: pointReward * 10

  lastScheduledAt   timestamp     default now
  createdBy         text          FK -> user.id
  createdAt         timestamp     default now
  updatedAt         timestamp     default now, onUpdate now

  UNIQUE: (id, language)


### task

  id                  serial          PK
  templateId          integer         FK -> template.id
  language            languageCode    not null
  date                date            not null  -- weekly: Monday, daily: that day
  origin              scheduleOrigin  not null

  titleResolved       text            not null
  descriptionResolved text
  objectivesResolved  jsonb           -- [{order, text}]
  agentPromptResolved text
  contextResolved     jsonb           -- platform-specific structure

  createdAt           timestamp       default now

  UNIQUE: (date, templateId)
  INDEX: (language, date)


### practiceSession [Phase A2]

  id                    serial          PK
  userId                text            FK -> user.id
  taskId                integer         FK -> task.id
  agentPromptSnapshot   jsonb           -- agentPromptResolved + selected persona
  status                sessionStatus   default 'in_progress'
  tutorFeedback         jsonb           -- {content, objectiveResults: [{order, text, met}]}
  startedAt             timestamp       default now
  completedAt           timestamp       nullable

  INDEX: (userId, taskId)


### sessionMessage [Phase A2]

  id            bigserial     PK
  sessionId     integer       FK -> practiceSession.id
  role          messageRole   not null
  content       text          not null
  llmMetadata   jsonb         -- {model, tokensUsed, latencyMs}
  createdAt     timestamp     default now

  INDEX: (sessionId)


## Relations

user -> userLearningProfile        (one to many)
user -> template.createdBy         (one to many)
user -> practiceSession            (one to many) [Phase A2]
template -> task                   (one to many)
task -> practiceSession            (one to many) [Phase A2]
practiceSession -> sessionMessage  (one to many) [Phase A2]
