import test from 'node:test';
import assert from 'node:assert/strict';
import {extractTechnologies} from './technologies.js';

test('pulls technologies from a job description in the order they appear', () => {
 const text = `Senior Software Engineer
We need React, TypeScript, and Node.js.
PostgreSQL, AWS, Docker, and Kubernetes.
Nice to have: Python and FastAPI.`;
 assert.deepEqual(extractTechnologies(text), [
  'React', 'TypeScript', 'Node.js', 'PostgreSQL', 'AWS', 'Docker', 'Kubernetes', 'Python', 'FastAPI'
 ]);
});

test('does not treat ordinary words as technologies', () => {
 assert.deepEqual(extractTechnologies("JavaScript developer. Let's go to market and express interest."), ['JavaScript']);
 assert.ok(extractTechnologies('Experience with Go, PostgreSQL.').includes('Go'));
 assert.ok(extractTechnologies('Golang and gRPC services.').includes('Go'));
 assert.deepEqual(extractTechnologies(''), []);
 assert.deepEqual(extractTechnologies('   '), []);
});

test('keeps specific framework names', () => {
 const found = extractTechnologies('C# ASP.NET Core and Spring Boot on Azure with SQL Server');
 for (const name of ['C#', 'ASP.NET', 'Spring Boot', 'Azure', 'SQL Server']) assert.ok(found.includes(name), name);
 assert.equal(found.includes('Spring'), false);
 assert.equal(found.includes('Java'), false);
 assert.equal(found.includes('Rails'), false);
 const rails = extractTechnologies('Ruby on Rails and PostgreSQL');
 assert.ok(rails.includes('Ruby on Rails'));
 assert.equal(rails.includes('Rails'), false);
 const mobile = extractTechnologies('React Native and React for web');
 assert.ok(mobile.includes('React Native'));
 assert.ok(mobile.includes('React'));
 assert.deepEqual(extractTechnologies('React Native developer'), ['React Native']);
});
