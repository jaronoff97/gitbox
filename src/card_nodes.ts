// The mounted cards' elements by thread id, so the board can find where a card is drawn (to open its
// menu from the keyboard). Lanes are windowed, so a card that isn't near the viewport has none.
import type { ShadowNode } from 'gpuix-svelte';

export const card_nodes = new Map<string, ShadowNode>();
