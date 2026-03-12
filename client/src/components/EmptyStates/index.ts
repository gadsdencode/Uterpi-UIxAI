// Main empty state component
export { EmptyState, EmptyStates } from '../ui/EmptyState';

// Specialized empty state components
export { default as ChatEmptyStates } from './ChatEmptyStates';
export { default as FileEmptyStates } from './FileEmptyStates';
export { default as SearchEmptyStates } from './SearchEmptyStates';

// Re-export for convenience
export * from './ChatEmptyStates';
export * from './FileEmptyStates';
export * from './SearchEmptyStates';
