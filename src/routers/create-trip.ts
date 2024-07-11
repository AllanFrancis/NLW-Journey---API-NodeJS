import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import dayjs from "dayjs";
import localizedFormat from "dayjs/plugin/localizedFormat";
import 'dayjs/locale/pt-br';
import nodemailer from "nodemailer";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { getMailClient } from "../lib/mail";

dayjs.locale('pt-br');
dayjs.extend(localizedFormat);

export async function createTrip(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().post('/trips', {
    schema: {
      body: z.object({
        destination: z.string().min(4),
        starts_at: z.coerce.date(),
        ends_at: z.coerce.date(),
        owner_name: z.string(),
        owner_email: z.string().email(),
        emails_to_invite: z.array(z.string().email()),
      })
    }
  }, async (request, reply) => {
    //coleção de dados
    const { destination, starts_at, ends_at, owner_name, owner_email, emails_to_invite } = request.body;

    //validação de dados
    if (dayjs(starts_at).isBefore(new Date())) {
      throw new Error('The trip cannot start in the past');
    }

    if (dayjs(ends_at).isBefore(starts_at)) {
      throw new Error('The trip cannot end before it starts');
    }

    //criação de viagem
    const trip = await prisma.trip.create({
      data: {
        destination,
        starts_at,
        ends_at,
        participants: {
          createMany: {
            data: [
              {
                name: owner_name,
                email: owner_email,
                is_owner: true,
                is_confirmed: true
              },
              ...emails_to_invite.map(email => ({
                email,
              }))
            ]
          }
        }
      }
    });

    //formata a data
    const formattedStartsAt = dayjs(starts_at).format('LL');
    const formattedEndsAt = dayjs(ends_at).format('LL');

    const confirmationLink = `http://localhost:3333/trips/${trip.id}/confirm`;

    //envio de email
    const mail = await getMailClient();
    const message = await mail.sendMail({
      from: {
        name: 'Trip Planner',
        address: 'oi@planner.er',
      },
      to: {
        name: owner_name,
        address: owner_email
      },
      subject: `Confirme sua viagem para ${destination} em ${formattedStartsAt} `,
      html: `
      <div style="font-family: sans-serif; font-size: 16px; line-height: 1.6;">
        <p>Você solicitou a criação de uma viagem para <strong>${destination}</strong> nas datas de <strong>${formattedStartsAt}</strong> até <strong>${formattedEndsAt}</strong>.</p>
        <p></p>
        <p>Para confirmar sua viagem, clique no link abaixo:</p>
        <p></p>
        <p><a href="${confirmationLink}">Confirmar viagem</a></p>
        <p></p>
        <p>Caso você não saiba do que se trata esse e-mail, apenas ignore-o.</p>
      </div>
      `.trim()
    });
    //Mostra o link da caixa do email no console
    console.log(nodemailer.getTestMessageUrl(message));

    //retorna o id da viagem
    return { trip_id: trip.id };
  });

}