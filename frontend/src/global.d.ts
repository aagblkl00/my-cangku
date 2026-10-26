declare module 'react' {
  export type ReactNode = any;
  export type ComponentType<P = {}> = (props: P) => any;
  export type ErrorInfo = { componentStack?: string };
  export class Component<P = {}, S = {}> {
    constructor(props: P);
    props: P;
    state: S;
    setState(state: Partial<S> | ((previous: S) => Partial<S>)): void;
  }
  export interface Context<T> { Provider: any; readonly _type?: T }
  export function createContext<T>(defaultValue: T): Context<T>;
  export function useContext<T>(context: Context<T>): T;
  export function useCallback<T extends (...args: any[]) => any>(callback: T, deps: unknown[]): T;
  export function useState<T>(initial: T): [T, (value: T | ((previous: T) => T)) => void];
  export function useEffect(effect: () => void | (() => void), deps?: unknown[]): void;
  export function useMemo<T>(factory: () => T, deps: unknown[]): T;
  export function useRef<T>(initial: T): { current: T };
  export const StrictMode: (props: { children?: unknown }) => unknown;
}
declare module 'react-dom/client';
declare module 'react/jsx-runtime';
declare namespace JSX { interface IntrinsicElements { [elemName: string]: any } }
