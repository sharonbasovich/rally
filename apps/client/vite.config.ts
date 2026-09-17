import {defineConfig} from 'vite';
export default defineConfig({base:'/',server:{port:5174,proxy:{'/api':'http://localhost:3001','/socket.io':{target:'http://localhost:3001',ws:true}}}});
