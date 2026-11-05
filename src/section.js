import { connectHost } from '@openchamber/sdk';
import { createBrainPane } from './brainpane.js';

createBrainPane(connectHost(), document);
