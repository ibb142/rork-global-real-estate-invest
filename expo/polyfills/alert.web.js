const Alert = {
  alert(title, message, buttons) {
    const text = [title, message].filter(Boolean).join('\n\n');
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
      window.alert(text);
    }
    const preferred = Array.isArray(buttons) ? buttons.find((button) => button.style !== 'cancel') ?? buttons[0] : null;
    if (preferred && typeof preferred.onPress === 'function') {
      preferred.onPress();
    }
  },
  prompt(title, message, callbackOrButtons) {
    const value = typeof window !== 'undefined' && typeof window.prompt === 'function'
      ? window.prompt([title, message].filter(Boolean).join('\n\n'))
      : null;
    if (typeof callbackOrButtons === 'function') {
      callbackOrButtons(value ?? '');
    }
  },
};

export default Alert;
