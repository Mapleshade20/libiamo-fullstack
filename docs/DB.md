# Libiamo Database Schema (Drizzle Pseudocode)

## Enums

userRole = enum('learner', 'admin')
languageCode = enum('en', 'es', 'fr', 'ja')
interactionType = enum('chat', 'oneshot', 'slow', 'translate')
uiVariant = enum('reddit', 'apple_mail', 'discord', 'imessage', 'ao3', 'translator')
cadence = enum('weekly', 'daily')
scheduleOrigin = enum('manual', 'auto')
sessionStatus = enum('in_progress', 'completed', 'evaluated', 'abandoned')  -- Phase A2
messageRole = enum('user', 'assistant', 'tutor', 'hint')                        -- Phase A2


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

  id                serial          PK
  isActive          boolean         default true
  language          languageCode    not null
  interactionType   interactionType not null
  ui                uiVariant       not null
  cadence           cadence         not null

  titleBase         text            not null  -- all 'base' fields support {{slot}} placeholders
  shortObjectiveBase text                     -- short, used for homepage card display
  descriptionBase   text                      -- describe the full scenario
  objectivesBase    text[]                    -- list of objective strings
  agentPromptBase   text                      -- system prompt template
  materialsMd       text                      -- learning material in Markdown, no slots
  tags              text[]          default {} -- categorization tags

  maxTurns          integer         -- 0 for oneshot/translate
  estimatedWords    integer
  difficulty        integer         check 1-3
  pointReward       integer
  gemReward         integer

  createdBy         text            FK -> user.id
  createdAt         timestamp       default now
  updatedAt         timestamp       default now, onUpdate now

  UNIQUE: (id, language)


### templateVariant

  id            serial    PK
  templateId    integer   FK -> template.id, onDelete cascade
  isActive      boolean   default true
  slotValues    jsonb     not null, default {}   -- {slotName: value}
  openingState  jsonb     not null, default {}   -- platform-specific UI state (pre-populated messages, etc.)
  createdAt     timestamp default now
  updatedAt     timestamp default now, onUpdate now

  INDEX: (templateId)

#### openingState examples by UI

```jsonc
// imessage
{
  "previousMessages": [
    { "sender": "Mom", "text": "Hey, are you coming home for dinner?" }
  ]
}

// discord
{
  "serverName": "Language Learners",
  "channelName": "general",
  "previousMessages": [
    { "sender": "Alex", "text": "Has anyone tried the new grammar drills?", "timestamp": "10:00" }
  ]
}

// reddit
{
  "post": {
    "title": "What's the hardest part of learning Spanish?",
    "body": "I've been studying for a year and still struggle with...",
    "subreddit": "r/languagelearning",
    "author": "curious_learner",
    "votes": 42
  },
  "previousComments": [
    { "author": "polyglot99", "text": "Subjunctive mood, hands down.", "votes": 15 }
  ]
}

// apple_mail
{
  "emails": [
    { "from": "boss@company.com", "to": "you@company.com", "subject": "Meeting Tomorrow", "body": "Hi, just a reminder...", "time": "14:30" }
  ]
}

// ao3
{
  "workTitle": "Across the Ocean",
  "chapterTitle": "Chapter 3: First Day",
  "bodyExcerpt": "The train arrived exactly on time...",
  "tags": ["Slow Burn", "Romance", "Modern AU"],
  "previousComments": [
    { "username": "fan123", "comment": "Loving this story so far!" }
  ]
}

// translator
{
  "sourceText": "Bonjour, comment allez-vous aujourd'hui ?"
}
```

### task (scheduled from a template+variant)

  id              serial          PK
  templateId      integer         FK -> template.id
  variantId       integer         FK -> templateVariant.id, not null
  language        languageCode    not null
  cadence         cadence         not null  -- copied from template at creation time
  date            date            not null  -- weekly: Monday, daily: that day
  origin          scheduleOrigin  not null

  title           text            not null
  description     text
  shortObjective  text
  objectives      text[]          -- resolved objective strings
  agentPrompt     text            -- resolved system prompt (includes injected MBTI persona prefix)

  createdAt       timestamp       default now

  UNIQUE: (date, templateId)
  INDEX: (language, date)
  INDEX: (language, cadence, date)


### practiceSession [Phase A2]

  id                    serial          PK
  userId                text            FK -> user.id
  taskId                integer         FK -> task.id
  agentPromptSnapshot   jsonb           -- agentPrompt + selected persona
  status                sessionStatus   default 'in_progress'
  tutorFeedback         jsonb           -- {content, objectiveResults: [{text, grade ("A"/"B"/"C")}]}
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
template -> templateVariant        (one to many)
template -> task                   (one to many)
templateVariant -> task            (one to many)
task -> practiceSession            (one to many) [Phase A2]
practiceSession -> sessionMessage  (one to many) [Phase A2]
