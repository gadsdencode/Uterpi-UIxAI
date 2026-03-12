# Snackbar Notification System

## Overview

The snackbar system provides simple, unobtrusive action confirmations that appear at the bottom-center of the screen. This system is separate from the existing intelligent toast system and is designed for immediate, short-lived feedback.

## Key Features

- **Position**: Bottom-center of the screen
- **Duration**: Auto-dismisses after 3 seconds
- **Types**: Success, Error, Info
- **Design**: Minimalist, dark rounded bar with icons
- **Behavior**: Fire-and-forget, no user interaction required

## Usage

### 1. Import the hook

```typescript
import { useSnackbar } from './SnackbarProvider';
```

### 2. Use in your component

```typescript
const MyComponent = () => {
  const snackbar = useSnackbar();

  const handleCopy = () => {
    navigator.clipboard.writeText("Some text to copy");
    snackbar.show("Copied to clipboard!", "success");
  };

  const handleError = () => {
    snackbar.show("Could not save settings.", "error");
  };

  const handleInfo = () => {
    snackbar.show("New feature available!", "info");
  };

  return (
    <div>
      <button onClick={handleCopy}>Copy</button>
      <button onClick={handleError}>Save with Error</button>
      <button onClick={handleInfo}>Show Info</button>
    </div>
  );
};
```

## API Reference

### `useSnackbar()` Hook

Returns an object with the following method:

#### `show(message: string, type?: SnackbarType)`

- **message**: The text to display
- **type**: Optional type, defaults to 'success'
  - `'success'`: Green checkmark icon
  - `'error'`: Red alert icon  
  - `'info'`: Blue info icon

## Examples

### Common Use Cases

```typescript
// Copy to clipboard
snackbar.show("Code copied to clipboard!", "success");

// Save confirmation
snackbar.show("Settings saved successfully!", "success");

// Error handling
snackbar.show("Failed to upload file.", "error");

// Information
snackbar.show("New update available!", "info");

// Default (success)
snackbar.show("Action completed!");
```

## Integration

The `SnackbarProvider` is already integrated into the main app in `main.tsx`. No additional setup is required.

## Design Principles

1. **Unobtrusive**: Positioned at bottom-center to avoid interfering with main UI
2. **Consistent**: Uniform design across all snackbar types
3. **Simple**: Single line of code to show a snackbar
4. **Automatic**: No user interaction required, auto-dismisses
5. **Distinct**: Separate from intelligent toasts to avoid confusion

## Comparison with Intelligent Toasts

| Feature | Snackbars | Intelligent Toasts |
|---------|-----------|-------------------|
| Purpose | Action confirmations | AI insights & complex feedback |
| Position | Bottom-center | Top-right |
| Duration | 3 seconds | 5-10 seconds |
| Interaction | None required | May have action buttons |
| Design | Simple, uniform | Complex, branded |
| Use Case | "Settings saved" | "Consider switching models" |

## Testing

Use the `SnackbarTest` component to test different snackbar types and compare with the existing toast system.
