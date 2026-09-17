import {test} from '@playwright/test';
import {multiplayer,practice,unavailableCamera} from './scenarios';
test('two browser sessions join, play, disconnect and recover',async({browser,baseURL})=>multiplayer(browser,baseURL!));
test('practice and duo stay hosted and never load local inference',async({browser,baseURL})=>practice(browser,baseURL!));
test('camera failures leave keyboard play available',async({browser,baseURL})=>unavailableCamera(browser,baseURL!));
