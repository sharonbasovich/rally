import {defineConfig} from '@playwright/test';
const baseURL=process.env.RALLY_LIVE_URL;
if(!baseURL||new URL(baseURL).protocol!=='https:')throw new Error('Set RALLY_LIVE_URL to the deployed HTTPS origin.');
export default defineConfig({testDir:'./tests/live',timeout:120000,workers:1,retries:0,use:{baseURL,headless:true,trace:'off',screenshot:'off',launchOptions:{args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']}}});
