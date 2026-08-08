interface ClosableWindow {
  once(event: "closed", listener: () => void): unknown;
}
export class WindowReference<TWindow extends ClosableWindow> {
  private current?: TWindow;

  set(window: TWindow): void {
    this.current = window;
    window.once("closed", () => {
      if (this.current === window) {
        this.current = undefined;
      }
    });
  }

  get(): TWindow | undefined {
    return this.current;
  }
}
