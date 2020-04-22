import * as Joi from '@hapi/joi';
import * as Inert from '@hapi/inert';
import * as Vision from '@hapi/vision';
import * as Hapi from '@hapi/hapi';
const got = require('got')
//const moment = require('moment')
const colors = require('colors');
const queryString = require('query-string')
require('dotenv').config();

import { MongoClient, ObjectId } from 'mongodb';

const HapiSwagger = require('hapi-swagger');

const protocol = process.env.PROTOCOL || 'http';
const port = process.env.PORT || 3000;
const server = new Hapi.Server({
  port,
  routes: {
    cors: {
      origin: ['*']
    }
  }
});

function subtractMinutes (date, minutes) {
  return new Date(date.getTime() - minutes * 60000);
}

interface Cities {
  createdAt: Date | unknown,
  state: string,
  country: string,
  _embedded: object[]
}

interface States {
  createdAt: Date | unknown,
  country: string,
  _embedded: object[]
}

interface Countries {
  createdAt: Date | unknown,
  _embedded: object[]
}

(async () => {

  const host = 'localhost';
  const database = 'airvisual'
  const connectionString = process.env.MONGODB_CONNECTION || `mongodb://${host}/${database}`;
  const connection = await MongoClient.connect(connectionString, {
    useNewUrlParser: true,
  });

  console.log('mongo db is running at', colors.green(connectionString));

  const sep = '/';
  const weatherDataApiBase = 'https://api.airvisual.com/v2';
  const citiesCollection = connection.db('airvisual').collection('city');
  const countriesCollection = connection.db('airvisual').collection('country');
  const statesCollection = connection.db('airvisual').collection('state');
  const key = process.env.AIRVISUAL_KEY
  console.log('using AirVisual key:', colors.green(key))

  await server.register([
    Inert,
    Vision,
    {
      plugin: HapiSwagger,
      options: {
        info: {
          title: 'AirVisual API Implementation',
          version: 'v0.0.1'
        }
      }
    }
  ]);

  const routeDocs = {
    method: 'GET',
    path: '/',
    config: {
      handler: (r, reply) => reply.redirect('/documentation')
    }
  };

  const routeGetStates = {
    method: 'GET',
    path: '/states',
    config: {
      handler: async req => {

        const {
          query: { country },
        } = req;

        var responseStatesList:States = {
          createdAt: null,
          country: null,
          _embedded: []
        }

        const now = new Date();
        const then = subtractMinutes(now, 43830)
        // update once a month
        const storedStates = statesCollection.find({
          createdAt: { 
            $gt: then
          },
          country: country
        }).limit(1).toArray();

        await storedStates.then(async (statesRef) => {
          const statesList = statesRef.length ? statesRef.pop() : false;
          if (!statesList) {
            console.log('Didn\'t find old states list');
            const _key = { key: key };
            const _country = { country: country };
            const _paramsBundle = { ..._key, ..._country };

            var url = [
              weatherDataApiBase,
              sep,
              'states',
              '?', 
              queryString.stringify(_paramsBundle)
            ].join('');
            console.log(url)

            const airVisualStatesList = await got(url);
            const _now = new Date();
            const _body = JSON.parse(airVisualStatesList.body);
            const newStatesList:States = {
              createdAt: _now,
              country: country,
              _embedded: _body.data
            };
            // write air visual API response to NoSQL store
            await statesCollection.insertOne(newStatesList).then(async () => {

              // get most recent write to the states list
              const mostRecentStatesList = statesCollection.find({
                country: country
              }, {
                sort: { createdAt: -1 }
              }).limit(1).toArray();
              await mostRecentStatesList.then((mostRecentStatesListRef) => {
                const _mostRecentStatesListRef = mostRecentStatesListRef.pop();
                responseStatesList = _mostRecentStatesListRef;
              });

            });
          } else {
            console.log('Found old states list')
            responseStatesList = statesList;
          }

        });

        return responseStatesList;
      },
      description: 'List all states per given country',
      notes: 'States from database',
      tags: ['api'],
      validate: {
        query: {
          country: Joi.string().required(),
        }
      }
    }
  }

  const routeGetCountries = {
    method: 'GET',
    path: '/countries',
    config: {
      handler: async req => {

        var responseCountriesList:Countries = {
          createdAt: null,
          _embedded: []
        }

        const now = new Date();
        const then = subtractMinutes(now, 43830)
        // update once a month
        const storedCountries = countriesCollection.find({
          createdAt: { 
            $gt: then
          }
        }, {
          sort: { createdAt: -1 }
        }).limit(1).toArray();

        await storedCountries.then(async (countriesRef) => {
          const countriesList = countriesRef.length ? countriesRef.pop() : false;
          if (!countriesList) {
            console.log('Didn\'t find old countries list');
            const _key = { key: key };

            var url = [
              weatherDataApiBase,
              sep,
              'countries',
              '?', 
              queryString.stringify(_key)
            ].join('');

            const airVisualCountriesList = await got(url);
            const _now = new Date();
            const _body = JSON.parse(airVisualCountriesList.body);
            const newCountriesList:Countries = {
              createdAt: _now,
              _embedded: _body.data
            };
            // write air visual API response to NoSQL store
            await countriesCollection.insertOne(newCountriesList).then(async () => {

              // get most recent write to the countries list
              const mostRecentCountriesList = countriesCollection.find({}, {
                sort: { createdAt: -1 }
              }).limit(1).toArray();
              await mostRecentCountriesList.then(async (mostRecentCountriesListRef) => {
                console.log(mostRecentCountriesListRef)
                const _mostRecentCountriesListRef = mostRecentCountriesListRef.pop();
                responseCountriesList = _mostRecentCountriesListRef;
              });
            });

          } else { 

            console.log('Found old countries list')
            responseCountriesList = countriesList;
          }
        });

        return responseCountriesList;

      },
      description: 'List all countries',
      notes: 'Countries from database',
      tags: ['api']
    }
  }


  const routeGetCities = {
    method: 'GET',
    path: '/cities',
    config: {
      handler: async req => {

        const {
          query: { state, country },
        } = req;

        var responseCitiesList:Cities = {
          createdAt: null,
          state: null,
          country: null,
          _embedded: []
        }

        const now = new Date();
        const then = subtractMinutes(now, 43830)
        // update once a month
        const storedCities = citiesCollection.find({
          createdAt: { 
            $gt: then
          },
          state: state,
          country: country
        }).limit(1).toArray();

        await storedCities.then(async (citiesRef) => {
          const citiesList = citiesRef.length ? citiesRef.pop() : false;
          if (!citiesList) {
            console.log('Didn\'t find old cities list');
            const _key = { key: key };
            const _state = { state: state };
            const _country = { country: country };
            const _paramsBundle = { 
              ..._key, 
              ..._state, 
              ..._country 
            };

            var url = [
              weatherDataApiBase,
              sep,
              'cities',
              '?', 
              queryString.stringify(_paramsBundle)
            ].join('');
            console.log(url)

            const airVisualCitiesList = await got(url);
            const _now = new Date();
            const _body = JSON.parse(airVisualCitiesList.body);
            const newCitiesList:Cities = {
              createdAt: _now,
              state: state,
              country: country,
              _embedded: _body.data
            };
            // write air visual API response to NoSQL store
            await citiesCollection.insertOne(newCitiesList).then(async () => {

              // get most recent write to the cities list
              const mostRecentCitiesList = citiesCollection.find({
                state: state,
                country: country
              }, {
                sort: { createdAt: -1 }
              }).limit(1).toArray();
              await mostRecentCitiesList.then((mostRecentCitiesListRef) => {
                const _mostRecentCitiesListRef = mostRecentCitiesListRef.pop();
                responseCitiesList = _mostRecentCitiesListRef;
              });

            });
          } else {
            console.log('Found old cities list')
            responseCitiesList = citiesList;
          }

        });

        return responseCitiesList;
      },
      description: 'List All Cities',
      notes: 'cities from database',
      tags: ['api'],
      validate: {
        query: {
          state: Joi.string().required(),
          country: Joi.string().required(),
        }
      }
    }
  }

  const routeGetCityByName = {
    method: 'GET',
    path: '/cities/{city_name}',
    config: {
      handler: async req => {

        var result = {};

        const {
          query: { state, country },
        } = req;

        const {
          params: { city_name },
        } = req;

        const _key = { key: key };
        const _state = { state: state };
        const _country = { country: country };
        const _city = { city: city_name };
        const _paramsBundle = { 
          ..._key, 
          ..._city, 
          ..._state, 
          ..._country 
        };

        var url = [
          weatherDataApiBase,
          sep,
          'city',
          '?', 
          queryString.stringify(_paramsBundle)
        ].join('');

        const airVisualCityData = await got(url);
        const _body = JSON.parse(airVisualCityData.body);
        result = _body;

        return result;
      },
      description: 'Get a city\'s data',
      notes: 'Get a city\'s data',
      tags: ['api'],
      validate: {
        query: {
          state: Joi.string().required(),
          country: Joi.string().required(),
        },
        params: {
          city_name: Joi.string().required()
        }
      }
    }
  };

  server.route([
    routeDocs,
    routeGetCities,
    routeGetCityByName,
    routeGetCountries,
    routeGetStates
  ]);

  await server.start();
  console.log('server running at', colors.green(`${protocol}://${host}:${port}`));
})();
