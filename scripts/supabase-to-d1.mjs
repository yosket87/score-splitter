#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { fileURLToPath } from 'node:url'

export function normalizePublicKeyBase64(value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('public_keyが不正です')
  }
  if (value.startsWith('\\x')) {
    return Buffer.from(value.slice(2), 'hex').toString('base64')
  }
  return value
}

export function buildD1ImportSql(exportData) {
  const statements = ['BEGIN TRANSACTION;']

  for (const row of exportData.incomes ?? []) {
    statements.push(
      `INSERT INTO incomes (id, month, label, amount, person, created_at, updated_at) VALUES (${[
        quote(row.id),
        quote(row.month),
        quote(row.label),
        number(row.amount),
        quote(row.person),
        quote(row.created_at),
        quote(row.updated_at ?? row.created_at),
      ].join(', ')});`
    )
  }

  for (const row of exportData.expenses ?? []) {
    statements.push(
      `INSERT INTO expenses (id, month, label, amount, person, is_carryover, created_at, updated_at) VALUES (${[
        quote(row.id),
        quote(row.month),
        quote(row.label),
        number(row.amount),
        quote(row.person),
        booleanInteger(row.is_carryover),
        quote(row.created_at),
        quote(row.updated_at ?? row.created_at),
      ].join(', ')});`
    )
  }

  for (const row of exportData.carryovers ?? []) {
    statements.push(
      `INSERT INTO carryovers (id, month, label, amount, person, is_cleared, created_at, updated_at) VALUES (${[
        quote(row.id),
        quote(row.month),
        quote(row.label),
        number(row.amount),
        quote(row.person),
        booleanInteger(row.is_cleared),
        quote(row.created_at),
        quote(row.updated_at ?? row.created_at),
      ].join(', ')});`
    )
  }

  for (const row of exportData.passkey_credentials ?? []) {
    statements.push(
      `INSERT INTO passkey_credentials (id, person, public_key_base64, counter, device_name, transports, created_at) VALUES (${[
        quote(row.id),
        quote(row.person),
        quote(normalizePublicKeyBase64(row.public_key ?? row.public_key_base64)),
        number(row.counter),
        nullableQuote(row.device_name),
        quote(JSON.stringify(row.transports ?? [])),
        quote(row.created_at),
      ].join(', ')});`
    )
  }

  statements.push('COMMIT;')
  return `${statements.join('\n')}\n`
}

async function main() {
  const [inputPath, outputPath] = process.argv.slice(2)
  if (!inputPath || !outputPath) {
    console.error(`Usage: node ${basename(process.argv[1])} <supabase-export.json> <d1-import.sql>`)
    process.exit(1)
  }

  const exportData = JSON.parse(await readFile(inputPath, 'utf-8'))
  await writeFile(outputPath, buildD1ImportSql(exportData))
}

function quote(value) {
  if (typeof value !== 'string') {
    throw new Error('文字列値が不正です')
  }
  return `'${value.replaceAll("'", "''")}'`
}

function nullableQuote(value) {
  if (value === null || value === undefined) {
    return 'NULL'
  }
  return quote(value)
}

function number(value) {
  if (!Number.isInteger(value)) {
    throw new Error('数値が不正です')
  }
  return String(value)
}

function booleanInteger(value) {
  return value === true || value === 1 ? '1' : '0'
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main()
}
