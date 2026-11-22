import { type Project, validateProject } from './model';

export interface ProjectHistory { past: Project[]; future: Project[] }

export function commitProjectEdit(previous: Project, history: ProjectHistory, edit: (p: Project) => void): Project {
  let next = structuredClone(previous);
  edit(next);
  next = validateProject(next);
  if (JSON.stringify(next) === JSON.stringify(previous))
    return previous;
  history.past.push(previous);
  if (history.past.length > 30)
    history.past.shift();
  history.future = [];
  return next;
}

export function undoProject(current: Project, history: ProjectHistory): Project {
  const previous = history.past.pop();
  if (!previous)
    return current;
  history.future.push(current);
  return previous;
}

export function redoProject(current: Project, history: ProjectHistory): Project {
  const next = history.future.pop();
  if (!next)
    return current;
  history.past.push(current);
  return next;
}
