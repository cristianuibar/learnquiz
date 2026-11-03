import { expect, it } from 'vitest'
import { initials, possessive, roleHeadline } from './invite'

it.each<[string | null, string, string]>([
  ['Warehouse picker', 'Acme', 'Train as a warehouse picker'],
  ['Inspector', 'Acme', 'Train as an inspector'],
  ['  Inspector  ', 'Acme', 'Train as an inspector'],
  ['SAP admin', 'Acme', 'Train as a SAP admin'],
  ['EU buyer', 'Acme', 'Train as an EU buyer'],
  [null, 'Acme', 'Join Acme'],
  ['  ', 'Acme', 'Join Acme'],
])('headline for %j at %s is %s', (role, company, headline) => {
  expect(roleHeadline(role, company)).toBe(headline)
})

it.each<[string, string]>([
  ['Northwind Logistics', 'Northwind Logistics’'],
  ['Acme', 'Acme’s'],
  [' Acme ', 'Acme’s'],
])('possessive of %j is %s', (name, result) => {
  expect(possessive(name)).toBe(result)
})

it.each<[string, string]>([
  ['', ''],
  ['acme', 'A'],
  ['Northwind Logistics', 'NL'],
  ['Northwind Logistics Group', 'NL'],
  ['  Northwind   Logistics  Group ', 'NL'],
])('initials of %j are %j', (name, result) => {
  expect(initials(name)).toBe(result)
})
