# Empty States System

This directory contains a comprehensive empty states system for the Uterpi AI application. The system provides consistent, user-friendly empty states across all areas of the application.

## Overview

Empty states are crucial for user experience as they:
- Guide users on what to do next
- Provide context about the current state
- Offer actionable steps to resolve empty states
- Maintain visual consistency across the application

## Components

### Core Components

#### `EmptyState` (Base Component)
The foundational empty state component with customizable:
- Icons and titles
- Descriptions and actions
- Multiple sizes (sm, md, lg)
- Multiple variants (default, minimal, illustrated)
- Custom content support

#### `EmptyStates` (Predefined States)
A collection of commonly used empty states:
- `NoData` - Generic no data state
- `Loading` - Loading state
- `ConnectionError` - Connection issues

### Specialized Components

#### `ChatEmptyStates`
Handles all chat and conversation-related empty states:
- `NoConversationSelected` - Welcome screen with onboarding
- `NoConversations` - No conversation history
- `NoMessages` - Empty conversation
- `NoSearchResults` - No search results in conversations
- `NoFilteredResults` - No results after filtering
- `NoStarredConversations` - No starred conversations
- `NoArchivedConversations` - No archived conversations
- `LoadingConversations` - Loading state
- `ConversationsError` - Error state

#### `FileEmptyStates`
Handles all file management-related empty states:
- `NoFiles` - No files uploaded (with onboarding)
- `NoFilesInFolder` - Empty folder
- `NoSearchResults` - No file search results
- `NoFilteredResults` - No results after filtering
- `NoAnalysis` - No AI analysis available
- `LoadingFiles` - Loading state
- `FilesError` - Error state
- `UploadPrompt` - Upload area prompt
- `NoRecentFiles` - No recent files
- `NoSharedFiles` - No shared files

#### `SearchEmptyStates`
Handles all search-related empty states:
- `NoResults` - No search results found
- `TooManyFilters` - Over-filtered results
- `SearchError` - Search error state
- `EmptyQuery` - Empty search query
- `PopularSearches` - Popular search suggestions
- `RecentSearches` - Recent search history

## Usage Examples

### Basic Usage

```tsx
import { EmptyState } from './ui/EmptyState';
import { MessageSquare } from 'lucide-react';

<EmptyState
  icon={MessageSquare}
  title="No conversations yet"
  description="Start your first conversation to begin chatting with AI."
  action={{
    label: "Start Chatting",
    onClick: () => startNewConversation()
  }}
/>
```

### Using Predefined States

```tsx
import { ChatEmptyStates } from './EmptyStates';

// For no conversations
<ChatEmptyStates.NoConversations 
  onStartNewConversation={() => startNewConversation()}
  onRefresh={() => fetchConversations()}
/>

// For search results
<ChatEmptyStates.NoSearchResults 
  searchTerm="example"
  hasFilters={true}
  onClearFilters={() => clearFilters()}
/>
```

### Custom Actions

```tsx
<EmptyState
  icon={Upload}
  title="Upload your first file"
  description="Get started by uploading files for AI analysis."
  action={{
    label: "Upload Files",
    onClick: () => openFileUpload(),
    variant: "default"
  }}
  secondaryAction={{
    label: "Learn More",
    onClick: () => showHelp(),
    variant: "outline"
  }}
/>
```

## Design Principles

### Visual Consistency
- Consistent icon sizing and spacing
- Unified color scheme using the app's design system
- Smooth animations and transitions
- Responsive design for all screen sizes

### User Guidance
- Clear, actionable titles and descriptions
- Contextual help and suggestions
- Progressive disclosure of information
- Guided onboarding for new users

### Accessibility
- Proper ARIA labels and descriptions
- Keyboard navigation support
- Screen reader compatibility
- High contrast support

## Implementation Guidelines

### When to Use Empty States
- When a list or collection is empty
- When search returns no results
- When filters produce no matches
- When loading fails or times out
- When user needs guidance on next steps

### Best Practices
1. **Be Specific**: Use context-aware messaging
2. **Provide Actions**: Always offer next steps
3. **Stay Positive**: Use encouraging language
4. **Be Helpful**: Include relevant suggestions
5. **Maintain Consistency**: Use the same patterns throughout

### Customization
- Override default props for specific use cases
- Add custom content using the `children` prop
- Use different variants for different contexts
- Implement custom animations for special cases

## Event Handling

The empty states system uses custom events for cross-component communication:

```tsx
// Start new conversation
window.dispatchEvent(new CustomEvent('startNewConversation'));

// Open file upload
window.dispatchEvent(new CustomEvent('openFileUpload'));

// Clear search
window.dispatchEvent(new CustomEvent('clearSearch'));

// Run analysis
window.dispatchEvent(new CustomEvent('runFileAnalysis', { 
  detail: { fileId: file.id } 
}));
```

## Future Enhancements

- Analytics tracking for empty state interactions
- A/B testing for different empty state designs
- Dynamic content based on user behavior
- Integration with help system and documentation
- Personalized suggestions based on user history

## Contributing

When adding new empty states:
1. Follow the existing naming conventions
2. Include proper TypeScript types
3. Add comprehensive documentation
4. Test across different screen sizes
5. Ensure accessibility compliance
6. Update this README with new components
