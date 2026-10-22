import {createConfigSchematics} from '@lmstudio/sdk';
export const configSchematics = createConfigSchematics()
 .field('model','string',{displayName:'MiniCPM5 model ID',subtitle:'ID returned by http://127.0.0.1:1234/v1/models'},'minicpm5-2b')
 .field('temperature','numeric',{displayName:'Temperature',slider:{min:0,max:2,step:0.05}},1)
 .build();
export const globalConfigSchematics = createConfigSchematics()
 .field('baseUrl','string',{displayName:'Local LM Studio API',subtitle:'Use the native local server; never point at the Generator plugin itself.'},'http://127.0.0.1:1234/v1')
 .build();
