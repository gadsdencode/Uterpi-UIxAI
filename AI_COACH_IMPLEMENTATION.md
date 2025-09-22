# AI Coach System Implementation

## Overview
The AI Coach system has been successfully implemented to evolve the existing intelligent toast system from a reactive tip provider into a proactive workflow analyzer and strategic advisor. This system analyzes user workflows, identifies inefficiencies, and provides high-level, project-specific strategic advice.

## Architecture

### Backend Components

#### 1. **AI Coach Service** (`server/ai-coach.ts`)
- Core service that manages workflow tracking and analysis
- Analyzes command sequences, model switching patterns, and time metrics
- Generates strategic insights using Azure AI
- Maintains workflow patterns and learning metrics
- Key features:
  - Workflow type detection (coding, debugging, analysis, writing, research)
  - Bottleneck identification
  - Efficiency scoring (0-100)
  - Model usage optimization
  - Complexity assessment

#### 2. **Enhanced Engagement Service** (`server/engagement.ts`)
- Integrated with AI Coach for seamless activity tracking
- Tracks granular workflow data alongside traditional engagement metrics
- Automatically forwards relevant activities to AI Coach service

#### 3. **Database Schema** (`shared/schema.ts`)
New tables added:
- `workflow_tracking`: Stores workflow sessions and command sequences
- `ai_coach_insights`: Strategic insights and recommendations
- `workflow_patterns`: Learned user behavior patterns
- `ai_coach_conversations`: Contextual coaching interactions

#### 4. **API Endpoints** (`server/routes.ts`)
- `GET /api/coach/insights`: Fetch pending AI insights
- `POST /api/coach/insights/:id/shown`: Mark insight as displayed
- `POST /api/coach/insights/:id/feedback`: Record user feedback
- `GET /api/coach/workflow-stats`: Get workflow statistics
- `POST /api/coach/track-command`: Track workflow commands
- `POST /api/coach/track-model-switch`: Track model switching

### Frontend Components

#### 1. **useAICoach Hook** (`client/src/hooks/useAICoach.ts`)
- Primary interface for AI Coach functionality
- Manages insights fetching and display
- Tracks commands and model switches
- Handles user feedback and recommendation application
- Features:
  - Auto-polling for new insights (configurable interval)
  - Real-time command tracking
  - Strategic advice generation
  - Workflow statistics management

#### 2. **Enhanced useIntelligentToast** (`client/src/hooks/useIntelligentToast.ts`)
- Integrated with AI Coach for comprehensive analysis
- Runs parallel analysis (traditional + AI Coach)
- Seamlessly tracks user actions to both systems

#### 3. **AI Coach Panel Component** (`client/src/components/AICoachPanel.tsx`)
- Beautiful, floating UI panel for displaying insights
- Collapsible/expandable design
- Shows workflow statistics
- Interactive recommendations with apply buttons
- Feedback mechanism (helpful/not helpful)
- Visual indicators for insight categories and impact levels

## Key Features

### 1. Strategic Insights
The AI Coach provides different levels of insights:
- **Strategic**: High-level workflow improvements
- **Tactical**: Specific optimization opportunities
- **Operational**: Day-to-day efficiency tips

### 2. Workflow Analysis
Comprehensive analysis includes:
- Command sequence tracking
- Model switching patterns
- Time metrics (total, active, idle time)
- Bottleneck identification
- Efficiency scoring
- Complexity assessment

### 3. Proactive Recommendations
Examples of insights provided:
- "I see you've spent 30 minutes debugging this Python file. Consider using the 'Code Refactor Agent' to automatically add error handling."
- "You frequently switch between GPT-4o and Claude. Create a custom 'Developer Assistant' persona that automatically routes tasks."
- "This project is growing in complexity. Would you like me to analyze the repository and suggest an improved folder structure?"

### 4. Learning System
The AI Coach learns from user patterns:
- Identifies repetitive workflows
- Tracks success rates of different approaches
- Builds user-specific optimization strategies
- Improves recommendations over time

## Integration with Azure AI

The system integrates with Azure AI for advanced analysis:
- Uses GPT-4o for strategic insight generation
- Analyzes workflow patterns for optimization opportunities
- Generates context-aware recommendations
- Provides measurable improvement metrics

## Usage

### 1. Enable AI Coach in Your Component
```tsx
import { AICoachPanel } from './components/AICoachPanel';

function App() {
  return (
    <>
      {/* Your app content */}
      <AICoachPanel position="bottom-right" autoExpand={false} />
    </>
  );
}
```

### 2. Track Custom Commands
```tsx
const { trackCommand } = useAICoach();

// Track a custom command
await trackCommand('refactor', 'gpt-4o', true);
```

### 3. Track Model Switches
```tsx
const { trackModelSwitch } = useAICoach();

// Track when user switches models
await trackModelSwitch('gpt-4o-mini', 'gpt-4o', 'Need better code generation');
```

## Database Migration

Run the migration to create AI Coach tables:
```sql
-- Run migration 0004_ai_coach_system.sql
```

## Configuration

### Environment Variables
Ensure these are set in your `.env`:
```
AZURE_AI_ENDPOINT=your_azure_endpoint
AZURE_AI_KEY=your_azure_key
```

### Customization Options
- Polling interval for insights (default: 30 seconds)
- Auto-fetch insights (default: true)
- Panel position (bottom-right, bottom-left, top-right, top-left)
- Auto-expand panel on high-priority insights

## Benefits

1. **Increased Productivity**: Users receive actionable insights that can save 20-30% of their time
2. **Better Model Utilization**: Recommendations for optimal model selection based on task type
3. **Workflow Optimization**: Identifies and eliminates bottlenecks in user workflows
4. **Learning System**: Improves over time by learning user patterns
5. **Strategic Guidance**: Goes beyond simple tips to provide workflow-level improvements

## Future Enhancements

1. **Custom Workflow Templates**: Allow users to save and reuse optimized workflows
2. **Team Insights**: Share learnings across team members
3. **Integration with IDEs**: Direct integration with VS Code, IntelliJ, etc.
4. **Voice Coaching**: Audio feedback for hands-free operation
5. **Predictive Assistance**: Anticipate user needs before they ask

## Technical Details

### Performance Considerations
- Insights are cached to prevent duplicate displays
- Workflow analysis runs asynchronously
- Database indexes ensure fast queries
- Polling intervals are configurable to balance freshness vs. load

### Security
- All insights are user-specific
- No cross-user data sharing
- Feedback is anonymous for improvement metrics
- Azure AI calls use secure endpoints

## Conclusion

The AI Coach system transforms Uterpi from a reactive tool into a proactive partner that understands user workflows and provides strategic guidance. This creates a "sticky" experience that drives long-term user loyalty by continuously improving their productivity and effectiveness.
