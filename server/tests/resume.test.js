import test from 'node:test';import assert from 'node:assert/strict';import {recommendResume,RESUME_NAMES} from '../src/resume-selector.js';
test('frontend default',()=>assert.equal(recommendResume('React TypeScript AEM'), 'Frontend_Resume'));
test('python',()=>assert.equal(recommendResume('FastAPI React'),'Python_Resume'));
test('node python',()=>assert.equal(recommendResume('Node.js Python React'),'Node_Python_Resume'));
test('java',()=>assert.equal(recommendResume('Spring Boot'),'Java_Resume'));
test('dotnet',()=>assert.equal(recommendResume('ASP.NET Core'),'.NET_Resume'));
test('go',()=>assert.equal(recommendResume('Golang Gin'),'GO_Resume'));
test('AI',()=>assert.equal(recommendResume('PyTorch MLflow'),'AI_ML_Resume'));
test('names',()=>assert.equal(RESUME_NAMES.length,8));
